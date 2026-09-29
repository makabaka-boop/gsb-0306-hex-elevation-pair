import { describe, expect, it } from 'vitest';
import { boardCells, centerOf, keyOf } from '../src/geometry/hex';
import type { Axial } from '../src/geometry/hex';
import { Rat } from '../src/geometry/rational';
import { computeBoard } from '../src/geometry/visibility';
import type { HeightProfile } from '../src/geometry/visibility';
import { cmpFrac, independentColumnEntry } from './independent';
import type { Frac } from './independent';

const A = (q: number, r: number): Axial => ({ q, r });

const profile = (
  observerEye: number,
  targetEye: number,
  entries: [string, number][],
): HeightProfile => ({
  observerEye,
  targetEye,
  blockerHeights: new Map(entries),
});

const heightsOf = (blockers: Axial[], height: number): [string, number][] =>
  blockers.map((c) => [keyOf(c), height]);

function verdictOf(
  observer: Axial,
  target: Axial,
  blockers: Axial[],
  h: HeightProfile,
  radius = 5,
  scale = 1,
) {
  const board = computeBoard(radius, observer, blockers, scale, h);
  const v = board.verdicts.get(keyOf(target));
  if (!v) throw new Error(`no verdict for ${keyOf(target)}`);
  return v;
}

describe('高度视线：眼高与柱高参与判定', () => {
  it('观察 (0,0)、目标 (2,0)、双眼高 8，(1,0) 柱高 0 不遮挡', () => {
    const v = verdictOf(A(0, 0), A(2, 0), [A(1, 0)], profile(8, 8, [['1,0', 0]]));
    expect(v.visible).toBe(true);
    expect(v.hits).toHaveLength(0);
    expect(v.first).toBeNull();
  });

  it('水平眼高 8 越过柱高 4 与恰好齐顶的柱高 8（触顶不挡）', () => {
    for (const height of [4, 8]) {
      const v = verdictOf(A(0, 0), A(2, 0), [A(1, 0)], profile(8, 8, [['1,0', height]]));
      expect(v.visible).toBe(true);
      expect(v.hits).toHaveLength(0);
    }
  });

  it('调整同一格高度 0→4（眼高 1）时遮挡数与首个命中相应出现', () => {
    const open = verdictOf(A(0, 0), A(2, 0), [A(1, 0)], profile(1, 1, [['1,0', 0]]));
    expect(open.visible).toBe(true);
    const blocked = verdictOf(A(0, 0), A(2, 0), [A(1, 0)], profile(1, 1, [['1,0', 4]]));
    expect(blocked.visible).toBe(false);
    expect(blocked.hits).toHaveLength(1);
    expect(blocked.first?.cell).toEqual(A(1, 0));
    expect(blocked.first?.t.toString()).toBe('1/4');
    expect(blocked.first?.point).toMatchObject({ x: Rat.of(1n), y: Rat.of(0n) });
  });

  it('路径上前方格高度 0、后方格高：0 高格不列为首个命中', () => {
    const blockers = [A(1, 0), A(3, 0)];
    const v = verdictOf(
      A(0, 0),
      A(4, 0),
      blockers,
      profile(2, 2, [
        ['1,0', 0],
        ['3,0', 8],
      ]),
    );
    expect(v.visible).toBe(false);
    expect(v.hits.map((h) => keyOf(h.cell))).toEqual(['3,0']);
    expect(v.first?.t.toString()).toBe('5/8');
    expect(v.first?.point.x.toString()).toBe('5');
  });

  it('仰视时入六边形即低于柱顶：交点为入六边形点', () => {
    // 眼高 1→8，柱高 4：h(lo)=1+7/4=11/4 < 4，t=1/4 处进入柱体
    const v = verdictOf(A(0, 0), A(2, 0), [A(1, 0)], profile(1, 8, [['1,0', 4]]));
    expect(v.visible).toBe(false);
    expect(v.first?.t.toString()).toBe('1/4');
    expect(v.first?.point.x.toString()).toBe('1');
    expect(v.first?.point.y.toString()).toBe('0');
  });

  it('仰视恰好擦过柱顶（入六边形点处 h=H）不遮挡', () => {
    // 眼高 1→5，柱高 2：h(lo)=1+4·(1/4)=2，之后全程高于柱顶
    const v = verdictOf(A(0, 0), A(2, 0), [A(1, 0)], profile(1, 5, [['1,0', 2]]));
    expect(v.visible).toBe(true);
    expect(v.hits).toHaveLength(0);
  });

  it('俯视时从柱顶上空进入：交点在柱顶平面，有理给出', () => {
    // 眼高 8→1，柱高 4：t=(8−4)/(8−1)=4/7，点 (4·t·2, 0)=(16/7, 0)
    const v = verdictOf(A(0, 0), A(2, 0), [A(1, 0)], profile(8, 1, [['1,0', 4]]));
    expect(v.visible).toBe(false);
    expect(v.first?.cell).toEqual(A(1, 0));
    expect(v.first?.t.toString()).toBe('4/7');
    expect(v.first?.point.x.toString()).toBe('16/7');
    expect(v.first?.point.y.toString()).toBe('0');
  });

  it('俯视入六边形时已低于柱顶：交点为入六边形点', () => {
    // 眼高 8→6，柱高 8：h(lo)=8−2/4=15/2 < 8
    const v = verdictOf(A(0, 0), A(2, 0), [A(1, 0)], profile(8, 6, [['1,0', 8]]));
    expect(v.visible).toBe(false);
    expect(v.first?.t.toString()).toBe('1/4');
  });

  it('俯视恰好擦过柱顶（出六边形点处 h=H）不遮挡', () => {
    // 眼高 5→1，柱高 2：h(hi)=5−4·(3/4)=2，内部全程高于柱顶
    const v = verdictOf(A(0, 0), A(2, 0), [A(1, 0)], profile(5, 1, [['1,0', 2]]));
    expect(v.visible).toBe(true);
  });

  it('高度判定同样具有缩放不变性', () => {
    const blockers = [A(2, 0), A(1, 0), A(0, 1), A(-1, 2)];
    const h = profile(3, 7, heightsOf(blockers, 5));
    const base = computeBoard(7, A(0, 0), blockers, 1, h);
    for (const scale of [2, 3, 7, 1000]) {
      const scaled = computeBoard(7, A(0, 0), blockers, scale, h);
      for (const cell of base.cells) {
        const a = base.verdicts.get(keyOf(cell))!;
        const b = scaled.verdicts.get(keyOf(cell))!;
        expect(b.visible).toBe(a.visible);
        expect(b.hits.map((x) => keyOf(x.cell))).toEqual(a.hits.map((x) => keyOf(x.cell)));
        for (let i = 0; i < a.hits.length; i++) {
          expect(b.hits[i].t.cmp(a.hits[i].t)).toBe(0);
        }
      }
    }
  });
});

describe('对拍：独立“临界参数 + 中点采样”高度柱体判定（半径 2 小棋盘）', () => {
  const radius = 2;
  const cells = boardCells(radius);
  // 穷举用边界眼高；随机用例再覆盖中间眼高
  const eyes = [0, 4, 8];
  const randomEyes = [0, 1, 2, 4, 6, 7, 8];
  const colHeights = [0, 1, 4, 8];

  function diffOne(
    observer: Axial,
    target: Axial,
    blockers: Axial[],
    h: HeightProfile,
    scale: number,
    got: { visible: boolean; hits: { cell: Axial; t: Rat }[] },
  ): string | null {
    const O = centerOf(observer, scale);
    const C = centerOf(target, scale);
    const expected = blockers
      .map((cell) => ({
        cell,
        // 高度不随水平缩放改变：线段与六边形同步放大，t 与 h(t) 保持不变
        t: independentColumnEntry(
          O,
          C,
          cell,
          BigInt(h.blockerHeights.get(keyOf(cell)) ?? 4),
          BigInt(h.observerEye),
          BigInt(h.targetEye),
          scale,
        ),
      }))
      .filter((x): x is { cell: Axial; t: Frac } => x.t !== null)
      .sort((a, b) => {
        const dt = cmpFrac(a.t, b.t);
        return dt !== 0 ? dt : a.cell.q - b.cell.q || a.cell.r - b.cell.r;
      });

    const ctx = `O=${keyOf(observer)} T=${keyOf(target)} oe=${h.observerEye} te=${h.targetEye} s=${scale}`;
    if (got.visible !== (expected.length === 0)) return `${ctx}: 可见性不一致`;
    if (got.hits.length !== expected.length) {
      return `${ctx}: 遮挡数不同 主=${got.hits.map((x) => keyOf(x.cell))} 独=${expected.map((x) => keyOf(x.cell))}`;
    }
    for (let i = 0; i < expected.length; i++) {
      if (keyOf(got.hits[i].cell) !== keyOf(expected[i].cell)) {
        return `${ctx}: 第 ${i} 个遮挡格不同 主=${keyOf(got.hits[i].cell)} 独=${keyOf(expected[i].cell)}`;
      }
      if (got.hits[i].t.n !== expected[i].t[0] || got.hits[i].t.d !== expected[i].t[1]) {
        return `${ctx}: ${keyOf(expected[i].cell)} 交入参数不同 主=${got.hits[i].t} 独=${expected[i].t[0]}/${expected[i].t[1]}`;
      }
    }
    return null;
  }

  it('全部观察点/目标 × 全阻挡（柱高 0 与非 0 混合）× 边界眼高组合 × 缩放', () => {
    let mismatch: string | null = null;
    for (const observer of cells) {
      const pool = cells.filter((c) => keyOf(c) !== keyOf(observer));
      // 同一份高度表（按序混合 0/1/4/8）对所有目标生效
      const entries: [string, number][] = pool.map((c, i) => [
        keyOf(c),
        colHeights[i % colHeights.length],
      ]);
      for (const oe of eyes) {
        for (const te of eyes) {
          const h = profile(oe, te, entries);
          for (const scale of [1, 3]) {
            const board = computeBoard(radius, observer, pool, scale, h);
            for (const target of pool) {
              const got = board.verdicts.get(keyOf(target))!;
              mismatch ??= diffOne(observer, target, pool, h, scale, got);
            }
          }
        }
      }
    }
    expect(mismatch).toBeNull();
  });

  it('seeded 随机阻挡集、柱高与眼高', () => {
    let seed = 0x7a57e1;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
    let mismatch: string | null = null;
    for (let iter = 0; iter < 600 && !mismatch; iter++) {
      const observer = pick(cells);
      let target = pick(cells);
      while (keyOf(target) === keyOf(observer)) target = pick(cells);
      const available = cells.filter((c) => keyOf(c) !== keyOf(observer));
      const size = 1 + Math.floor(rand() * available.length);
      const set = new Map<string, Axial>();
      while (set.size < size) {
        const c = pick(available);
        set.set(keyOf(c), c);
      }
      const blockers = [...set.values()];
      const entries: [string, number][] = blockers.map((c) => [
        keyOf(c),
        pick(colHeights),
      ]);
      const h = profile(pick(randomEyes), pick(randomEyes), entries);
      const board = computeBoard(radius, observer, blockers, 1, h);
      mismatch ??= diffOne(observer, target, blockers, h, 1, board.verdicts.get(keyOf(target))!);
    }
    expect(mismatch).toBeNull();
  });
});
