// オリンピックの得点計算（画面に依存しない純粋な計算だけを置く）
//
// ルール
//  - ダイヤ（グリーン外からチップイン）は 5 点。何人いても全員 5 点
//  - ダイヤ以外で順位が付いた人を遠い順に 金4・銀3・銅2・鉄1。1 パットで入れたときだけ得点、外せば 0 点
//    （人数分だけメダルを使うので、3 人なら 金銀銅、ダイヤが出れば残りの人数分だけ）
//  - 砂イチ（オプション）：砂イチが付いていて、入れた（ダイヤも含む）なら +3
//  - くず鉄（オプション）：順位が付いた人が 2 人以上いるとき、一番近い人が外したら −1
//  - ギブアップ・未入力は 0 点
//  - 最終得点（組の中で計算）＝ 本人の点数 × 他の人の数 − 他の人の点数の合計
import type { CompeBody, Group, OlympicResult, OlympicSettings } from './types';

export const MEDALS = ['金', '銀', '銅', '鉄'] as const;
export const MEDAL_POINTS = [4, 3, 2, 1] as const;
export const DIAMOND_POINTS = 5;
export const SAND_BONUS = 3;
export const KUZUTETSU_PENALTY = -1;

export type OlympicEntry = Pick<OlympicResult, 'user_id' | 'state' | 'rank' | 'made' | 'sand'>;

export interface HoleScore {
  user_id: string;
  points: number;
  /** 表示用のラベル（例：「金」「ダイヤ」「ギブアップ」） */
  label: string;
  made: boolean;
  sand: boolean;
  kuzutetsu: boolean;
}

/** 1 ホール・1 組分の点数 */
export function scoreHole(entries: OlympicEntry[], opt: Pick<OlympicSettings, 'sand' | 'kuzutetsu'>): HoleScore[] {
  const rankedCount = entries.filter((e) => e.state === 'ranked').length;
  return entries.map((e) => {
    let points = 0;
    let label = '';
    let kuzutetsu = false;
    const made = e.state === 'diamond' || (e.state === 'ranked' && e.made);
    if (e.state === 'diamond') {
      points = DIAMOND_POINTS;
      label = 'ダイヤ';
    } else if (e.state === 'ranked' && e.rank) {
      label = MEDALS[e.rank - 1];
      if (e.made) points = MEDAL_POINTS[e.rank - 1];
      else if (opt.kuzutetsu && rankedCount >= 2 && e.rank === rankedCount) {
        points = KUZUTETSU_PENALTY;
        kuzutetsu = true;
      }
    } else if (e.state === 'giveup') {
      label = 'ギブアップ';
    }
    const sand = opt.sand && e.sand && made;
    if (sand) points += SAND_BONUS;
    return { user_id: e.user_id, points, label, made, sand, kuzutetsu };
  });
}

/** 組の人数で最終得点を出す：本人 × 他の人の数 − 他の人の合計 */
export function finalScores(raw: number[]): number[] {
  const n = raw.length;
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((r) => r * (n - 1) - (sum - r));
}

export interface OlympicStanding {
  user_id: string;
  name: string;
  raw: number;
  final: number;
  rank: number;
  holes: { hole: number; label: string; points: number; made: boolean; sand: boolean; kuzutetsu: boolean }[];
}

export function groupMembers(body: CompeBody, group: Group) {
  return body.players.filter((p) => p.group_id === group.id);
}

/** オリンピックを使える組か（コンペで有効・組で表示・3〜4 人） */
export function olympicAvailable(body: CompeBody, group: Group | undefined): boolean {
  if (!body.olympic.enabled || !group || !group.olympic_on) return false;
  const n = groupMembers(body, group).length;
  return n >= 3 && n <= 4;
}

/** 組のオリンピック順位（最終得点の高い順。同点は同順位） */
export function groupStandings(body: CompeBody, group: Group): OlympicStanding[] {
  const members = groupMembers(body, group);
  const ids = new Set(members.map((m) => m.user_id));
  const results = body.olympic_results.filter((r) => ids.has(r.user_id));
  const perUser = new Map(members.map((m) => [m.user_id, { raw: 0, holes: [] as OlympicStanding['holes'] }]));
  for (let hole = 1; hole <= 18; hole++) {
    const entries = results.filter((r) => r.hole === hole);
    if (entries.length === 0) continue;
    for (const s of scoreHole(entries, body.olympic)) {
      const u = perUser.get(s.user_id)!;
      u.raw += s.points;
      u.holes.push({ hole, label: s.label, points: s.points, made: s.made, sand: s.sand, kuzutetsu: s.kuzutetsu });
    }
  }
  const raw = members.map((m) => perUser.get(m.user_id)!.raw);
  const fin = finalScores(raw);
  const rows: OlympicStanding[] = members.map((m, i) => ({
    user_id: m.user_id,
    name: m.display_name,
    raw: raw[i],
    final: fin[i],
    rank: 0,
    holes: perUser.get(m.user_id)!.holes,
  }));
  rows.sort((a, b) => b.final - a.final || a.name.localeCompare(b.name, 'ja'));
  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1].final === r.final ? rows[i - 1].rank : i + 1;
  });
  return rows;
}

// ---- 入力画面での操作（遠い順にタップ）。どれも新しい配列を返す ----------------

/** 順位を 1 から詰め直す */
function renumber(entries: OlympicEntry[]): OlympicEntry[] {
  const ranked = entries.filter((e) => e.state === 'ranked').sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const newRank = new Map(ranked.map((e, i) => [e.user_id, i + 1]));
  return entries.map((e) => (e.state === 'ranked' ? { ...e, rank: newRank.get(e.user_id)! } : e));
}

function without(entries: OlympicEntry[], userId: string) {
  return entries.filter((e) => e.user_id !== userId);
}

/** 名前をタップ：未入力なら次の順位を付ける。順位付きなら外す（後ろの人が繰り上がる） */
export function tapPlayer(entries: OlympicEntry[], userId: string): OlympicEntry[] {
  const cur = entries.find((e) => e.user_id === userId);
  if (cur?.state === 'ranked') return renumber(without(entries, userId));
  const next = entries.filter((e) => e.state === 'ranked').length + 1;
  return renumber([...without(entries, userId), { user_id: userId, state: 'ranked', rank: next, made: false, sand: false }]);
}

export function toggleDiamond(entries: OlympicEntry[], userId: string): OlympicEntry[] {
  const cur = entries.find((e) => e.user_id === userId);
  if (cur?.state === 'diamond') return renumber(without(entries, userId));
  return renumber([...without(entries, userId), { user_id: userId, state: 'diamond', rank: null, made: true, sand: false }]);
}

export function toggleGiveup(entries: OlympicEntry[], userId: string): OlympicEntry[] {
  const cur = entries.find((e) => e.user_id === userId);
  if (cur?.state === 'giveup') return renumber(without(entries, userId));
  return renumber([...without(entries, userId), { user_id: userId, state: 'giveup', rank: null, made: false, sand: false }]);
}

export function toggleMade(entries: OlympicEntry[], userId: string): OlympicEntry[] {
  return entries.map((e) =>
    e.user_id === userId && e.state === 'ranked' ? { ...e, made: !e.made, sand: e.made ? false : e.sand } : e,
  );
}

export function toggleSand(entries: OlympicEntry[], userId: string): OlympicEntry[] {
  return entries.map((e) =>
    e.user_id === userId && (e.state === 'diamond' || (e.state === 'ranked' && e.made)) ? { ...e, sand: !e.sand } : e,
  );
}
