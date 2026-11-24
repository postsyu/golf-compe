import type { CompeBody } from './types';

export interface RankRow {
  user_id: string;
  name: string;
  total: number;
  rank: number;
  byType: { type_id: string; name: string; count: number }[];
  byHole: { hole: number; type: string; count: number }[];
}

/** 罰ゲームランキング：全罰の合計回数の多い順。同数は同順位 */
export function penaltyRanking(body: CompeBody): RankRow[] {
  const typeName = new Map(body.penalty_types.map((p) => [p.id, p.name]));
  const typeOrder = new Map(body.penalty_types.map((p, i) => [p.id, i]));
  const rows: RankRow[] = body.players.map((pl) => {
    const mine = body.counts.filter((c) => c.user_id === pl.user_id && c.count > 0);
    const byType = body.penalty_types
      .map((pt) => ({
        type_id: pt.id,
        name: pt.name,
        count: mine.filter((c) => c.type_id === pt.id).reduce((s, c) => s + c.count, 0),
      }))
      .filter((x) => x.count > 0);
    const byHole = mine
      .map((c) => ({ hole: c.hole, type: typeName.get(c.type_id) ?? '', count: c.count, o: typeOrder.get(c.type_id) ?? 0 }))
      .sort((a, b) => a.hole - b.hole || a.o - b.o)
      .map(({ hole, type, count }) => ({ hole, type, count }));
    return {
      user_id: pl.user_id,
      name: pl.display_name,
      total: byType.reduce((s, x) => s + x.count, 0),
      rank: 0,
      byType,
      byHole,
    };
  });
  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ja'));
  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].rank : i + 1;
  });
  return rows;
}

export function countOf(body: CompeBody, userId: string, hole: number, typeId: string) {
  return body.counts.find((c) => c.user_id === userId && c.hole === hole && c.type_id === typeId);
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const w = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
  return `${y}/${m}/${d}(${w})`;
}

/**
 * 表示のオンオフを反映したコンペの中身。データは消さず、オフの項目を画面から外すだけ。
 *  - 非表示の罰は入力欄・ランキング（合計回数）から外れる
 *  - 英語禁止発話が非表示なら、英語禁止ホールの印も出さない
 *  - ドラコン・ニアピンが非表示なら、対象ホールの印と「現在のトップ」を出さない
 */
/** データベースが古い（新しい項目がない）ときでも動くように、足りない項目を補う */
export function normalizeBody<T extends CompeBody>(body: T): T {
  return {
    ...body,
    groups: body.groups.map((g) => ({ ...g, olympic_on: g.olympic_on ?? true })),
    penalty_types: body.penalty_types.map((p) => ({ ...p, visible: p.visible ?? true })),
    display: body.display ?? { longest: true, nearest: true },
    olympic: body.olympic ?? { enabled: false, sand: true, kuzutetsu: true },
    olympic_results: body.olympic_results ?? [],
  };
}

export function visibleBody<T extends CompeBody>(body: T): T {
  const types = body.penalty_types.filter((p) => p.visible);
  const englishShown = types.some((p) => p.english_only);
  return {
    ...body,
    penalty_types: types,
    holes: {
      english: englishShown ? body.holes.english : [],
      longest: body.display.longest ? body.holes.longest : [],
      nearest: body.display.nearest ? body.holes.nearest : [],
    },
  };
}
