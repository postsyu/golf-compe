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
