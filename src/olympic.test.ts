import { describe, expect, it } from 'vitest';
import { finalScores, scoreHole, tapPlayer, toggleDiamond, toggleGiveup, toggleMade, type OlympicEntry } from './olympic';

const ON = { sand: true, kuzutetsu: true };
const OFF = { sand: false, kuzutetsu: false };
const r = (user_id: string, rank: number, made = false, sand = false): OlympicEntry => ({ user_id, state: 'ranked', rank, made, sand });
const dia = (user_id: string, sand = false): OlympicEntry => ({ user_id, state: 'diamond', rank: null, made: true, sand });
const give = (user_id: string): OlympicEntry => ({ user_id, state: 'giveup', rank: null, made: false, sand: false });
const pts = (entries: OlympicEntry[], opt = ON) => Object.fromEntries(scoreHole(entries, opt).map((s) => [s.user_id, s.points]));

describe('最終得点（本人×他の人数 − 他の人の合計）', () => {
  it('ルール説明の例：8・7・5・2 → 10・6・−2・−14', () => {
    expect(finalScores([8, 7, 5, 2])).toEqual([10, 6, -2, -14]);
  });
  it('合計は必ず 0', () => {
    expect(finalScores([3, 9, 4]).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('メダルと点数', () => {
  it('4人：金4・銀3・銅2・鉄1（全員成功）', () => {
    expect(pts([r('A', 1, true), r('B', 2, true), r('C', 3, true), r('D', 4, true)])).toEqual({ A: 4, B: 3, C: 2, D: 1 });
  });
  it('外せば 0 点', () => {
    expect(pts([r('A', 1, false), r('B', 2, true), r('C', 3, false), r('D', 4, true)], OFF)).toEqual({ A: 0, B: 3, C: 0, D: 1 });
  });
  it('4人＋ダイヤ：ダイヤ5、残りは金銀銅', () => {
    expect(pts([dia('A'), r('B', 1, true), r('C', 2, true), r('D', 3, true)])).toEqual({ A: 5, B: 4, C: 3, D: 2 });
  });
  it('3人＋ダイヤ：ダイヤ5、残りは金銀', () => {
    expect(pts([dia('A'), r('B', 1, true), r('C', 2, true)])).toEqual({ A: 5, B: 4, C: 3 });
  });
  it('ダイヤ2人：両方5点、残りに金から', () => {
    expect(pts([dia('A'), dia('B'), r('C', 1, true), r('D', 2, true)])).toEqual({ A: 5, B: 5, C: 4, D: 3 });
  });
  it('ギブアップは 0 点', () => {
    expect(pts([give('A'), r('B', 1, true), r('C', 2, true), r('D', 3, true)])).toEqual({ A: 0, B: 4, C: 3, D: 2 });
  });
});

describe('砂イチ', () => {
  it('入れたら +3', () => {
    expect(pts([r('A', 1, true, true), r('B', 2, true)])).toMatchObject({ A: 7 });
  });
  it('ダイヤ＋砂イチは 8 点', () => {
    expect(pts([dia('A', true), r('B', 1, true)])).toMatchObject({ A: 8 });
  });
  it('オプション無効ならボーナスなし', () => {
    expect(pts([r('A', 1, true, true), r('B', 2, true)], OFF)).toMatchObject({ A: 4 });
  });
});

describe('くず鉄（一番近い人が外したら −1）', () => {
  it('① 4人・ダイヤなし：鉄が外すと −1', () => {
    expect(pts([r('A', 1), r('B', 2), r('C', 3), r('D', 4)])).toEqual({ A: 0, B: 0, C: 0, D: -1 });
  });
  it('② 3人・ダイヤなし：銅が外すと −1', () => {
    expect(pts([r('A', 1), r('B', 2), r('C', 3)])).toMatchObject({ C: -1 });
  });
  it('③ 4人・ダイヤ1人：銅が外すと −1', () => {
    expect(pts([dia('A'), r('B', 1), r('C', 2), r('D', 3)])).toMatchObject({ D: -1 });
  });
  it('④ 3人・ダイヤ1人：銀が外すと −1', () => {
    expect(pts([dia('A'), r('B', 1), r('C', 2)])).toMatchObject({ C: -1 });
  });
  it('⑤ 4人で1人ギブアップ：銅が外すと −1', () => {
    expect(pts([give('A'), r('B', 1), r('C', 2), r('D', 3)])).toMatchObject({ A: 0, D: -1 });
  });
  it('順位が付いた人が1人だけならくず鉄なし', () => {
    expect(pts([give('A'), give('B'), r('C', 1)])).toMatchObject({ C: 0 });
  });
  it('入れれば −1 にならない', () => {
    expect(pts([r('A', 1), r('B', 2, true)])).toMatchObject({ B: 3 });
  });
  it('オプション無効なら 0', () => {
    expect(pts([r('A', 1), r('B', 2)], OFF)).toMatchObject({ B: 0 });
  });
});

describe('入力操作', () => {
  it('遠い順にタップすると 1,2,3 と付き、途中を外すと繰り上がる', () => {
    let e: OlympicEntry[] = [];
    e = tapPlayer(e, 'A');
    e = tapPlayer(e, 'B');
    e = tapPlayer(e, 'C');
    e = tapPlayer(e, 'A'); // A を外す
    expect(Object.fromEntries(e.map((x) => [x.user_id, x.rank]))).toEqual({ B: 1, C: 2 });
  });
  it('ダイヤ・ギブアップにすると順位から外れて詰まる', () => {
    let e = [r('A', 1), r('B', 2), r('C', 3)];
    e = toggleDiamond(e, 'A');
    e = toggleGiveup(e, 'B');
    expect(e.find((x) => x.user_id === 'C')!.rank).toBe(1);
  });
  it('成功を外すと砂イチも外れる', () => {
    const e = toggleMade([r('A', 1, true, true)], 'A');
    expect(e[0]).toMatchObject({ made: false, sand: false });
  });
});
