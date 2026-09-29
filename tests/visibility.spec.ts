import { describe, expect, it } from 'vitest';
import { boardCells, centerOf, halfPlanesOf, keyOf } from '../src/geometry/hex';
import type { Axial } from '../src/geometry/hex';
import { Rat } from '../src/geometry/rational';
import { compareHits, computeBoard, hexEntry } from '../src/geometry/visibility';
import type { BlockHit, BoardResult, CellVerdict, HeightProfile } from '../src/geometry/visibility';
import { cmpFrac, independentCellEntry } from './independent';
import type { Frac } from './independent';

const A = (q: number, r: number): Axial => ({ q, r });

function verdict(board: BoardResult, c: Axial): CellVerdict {
  const v = board.verdicts.get(keyOf(c));
  if (!v) throw new Error(`no verdict for ${keyOf(c)}`);
  return v;
}

describe('擦角（视线恰擦过障碍格的角）', () => {
  const observer = A(0, 0);

  it('恰过顶点的视线不被遮挡', () => {
    // 观察点 (0,0) → 目标 (5,2)，格心连线 y = x/2 恰好擦过障碍 (2,0) 的顶点 (4,2)
    const board = computeBoard(7, observer, [A(2, 0)]);
    const v = verdict(board, A(5, 2));
    expect(v.visible).toBe(true);
    expect(v.hits).toHaveLength(0);
  });

  it('略微偏移则进入内部，并给出有理交入位置', () => {
    // 目标 (5,1)：格心 (11,3)，在 (3, 9/11) 处进入障碍 (2,0)，t = 3/11
    const board = computeBoard(7, observer, [A(2, 0)]);
    const v = verdict(board, A(5, 1));
    expect(v.visible).toBe(false);
    expect(v.first?.cell).toEqual(A(2, 0));
    expect(v.first?.t.toString()).toBe('3/11');
    expect(v.first?.point.x.toString()).toBe('3');
    expect(v.first?.point.y.toString()).toBe('9/11');
  });
});

describe('沿边（视线贴着障碍格的边）', () => {
  it('沿两格共享边前进不算遮挡', () => {
    // 视线 y = x 沿 (1,0) 与 (0,1) 的共享边 (1,1)-(2,2) 前进
    const board = computeBoard(4, A(0, 0), [A(1, 0), A(0, 1)]);
    expect(verdict(board, A(1, 1)).visible).toBe(true);
    expect(verdict(board, A(2, 2)).visible).toBe(true);
  });

  it('偏离边进入内部则被挡', () => {
    // 目标 (2,1)：格心 (5,3)，在 (1, 3/5) 处进入障碍 (1,0)，t = 1/5
    const board = computeBoard(4, A(0, 0), [A(1, 0)]);
    const v = verdict(board, A(2, 1));
    expect(v.visible).toBe(false);
    expect(v.first?.cell).toEqual(A(1, 0));
    expect(v.first?.t.toString()).toBe('1/5');
    expect(v.first?.point.x.toString()).toBe('1');
    expect(v.first?.point.y.toString()).toBe('3/5');
  });
});

describe('两障碍同距', () => {
  // 视线穿过 (1,0) 与 (0,1) 的共同顶点 (1,1)：两障碍距观察点等距，
  // 但只有 (1,0) 的内部被穿过；(0,1) 仅边界接触，不得计入。
  const observer = A(-2, 1); // 格心 (-3, 3)
  const target = A(5, -1); // 格心 (9, -3)

  it('同距的边界接触格不算遮挡', () => {
    const board = computeBoard(5, observer, [A(1, 0), A(0, 1)]);
    const v = verdict(board, target);
    expect(v.visible).toBe(false);
    expect(v.hits.map((h) => h.cell)).toEqual([A(1, 0)]);
    expect(v.first?.t.toString()).toBe('1/3');
    expect(v.first?.point.x.toString()).toBe('1');
    expect(v.first?.point.y.toString()).toBe('1');
  });

  it('最先遮挡与阻挡输入顺序无关', () => {
    const b1 = computeBoard(5, observer, [A(1, 0), A(0, 1)]);
    const b2 = computeBoard(5, observer, [A(0, 1), A(1, 0)]);
    expect(verdict(b1, target).first?.cell).toEqual(verdict(b2, target).first?.cell);
  });

  it('多个阻挡按交入位置排序', () => {
    // 视线沿 x 轴依次穿过 (1,0) 与 (3,0)
    const board = computeBoard(4, A(0, 0), [A(3, 0), A(1, 0)]);
    const v = verdict(board, A(4, 0));
    expect(v.hits.map((h) => h.cell)).toEqual([A(1, 0), A(3, 0)]);
    expect(v.hits[0].t.toString()).toBe('1/8');
    expect(v.hits[1].t.toString()).toBe('5/8');
  });

  it('交入位置相同的并列按 q、r 裁决', () => {
    const t = Rat.of(1n, 3n);
    const hits: BlockHit[] = [
      { cell: A(0, 1), t, point: { x: t, y: t } },
      { cell: A(-1, 2), t, point: { x: t, y: t } },
      { cell: A(0, -1), t, point: { x: t, y: t } },
    ];
    const sorted = [...hits].sort(compareHits);
    expect(sorted.map((h) => h.cell)).toEqual([A(-1, 2), A(0, -1), A(0, 1)]);
  });
});

describe('缩放不变性', () => {
  const observer = A(0, 0);
  const blockers = [A(2, 0), A(1, 0), A(0, 1), A(-1, 2)];
  const radius = 7;

  it('可见性、最先遮挡与交入参数不随缩放改变', () => {
    const base = computeBoard(radius, observer, blockers, 1);
    for (const scale of [2, 3, 7, 1000]) {
      const scaled = computeBoard(radius, observer, blockers, scale);
      for (const cell of base.cells) {
        const a = verdict(base, cell);
        const b = verdict(scaled, cell);
        expect(b.visible).toBe(a.visible);
        expect(b.hits.map((h) => keyOf(h.cell))).toEqual(a.hits.map((h) => keyOf(h.cell)));
        for (let i = 0; i < a.hits.length; i++) {
          expect(b.hits[i].t.cmp(a.hits[i].t)).toBe(0);
          // 交入点随缩放线性放大，判定本身不变
          expect(b.hits[i].point.x.cmp(a.hits[i].point.x.mul(Rat.of(scale)))).toBe(0);
          expect(b.hits[i].point.y.cmp(a.hits[i].point.y.mul(Rat.of(scale)))).toBe(0);
        }
      }
    }
  });
});

describe('高度视线', () => {
  const observer = A(0, 0);
  const target = A(2, 0);
  const middle = A(1, 0);
  // 开线段 (0,0)→(4,0) 在 t=1/4 处进入 (1,0)，t=3/4 处离开，平面区间 (1/4, 3/4)。
  const profile = (
    blockerHeights: Record<string, number>,
    observerEye: number,
    targetEye: number,
  ): HeightProfile => ({
    observerEye,
    targetEye,
    blockerHeights: new Map(Object.entries(blockerHeights)),
  });

  it('中间格高度 0、两端眼高 8：视线可见且无命中', () => {
    const board = computeBoard(4, observer, [middle], 1, profile({ '1,0': 0 }, 8, 8));
    const v = verdict(board, target);
    expect(v.visible).toBe(true);
    expect(v.hits).toHaveLength(0);
  });

  it('同一格从 0 调到 8：两端眼高 8 时恰好触顶，不遮挡', () => {
    const b0 = computeBoard(4, observer, [middle], 1, profile({ '1,0': 0 }, 8, 8));
    const b8 = computeBoard(4, observer, [middle], 1, profile({ '1,0': 8 }, 8, 8));
    expect(verdict(b0, target).hits).toHaveLength(0);
    expect(verdict(b8, target).hits).toHaveLength(0);
  });

  it('同一格从 0 调到 4：两端眼高 8 时穿过柱体上方，高度变化不改变无遮挡结论', () => {
    const b0 = computeBoard(4, observer, [middle], 1, profile({ '1,0': 0 }, 8, 8));
    const b4 = computeBoard(4, observer, [middle], 1, profile({ '1,0': 4 }, 8, 8));
    expect(verdict(b0, target).visible).toBe(true);
    expect(verdict(b4, target).visible).toBe(true);
  });

  it('调低阻挡格高度使视线越过：可见性随高度恢复', () => {
    // 两端眼高 1，柱高 4 必挡；柱高 0 不挡。
    const blocked = computeBoard(4, observer, [middle], 1, profile({ '1,0': 4 }, 1, 1));
    const cleared = computeBoard(4, observer, [middle], 1, profile({ '1,0': 0 }, 1, 1));
    expect(verdict(blocked, target).visible).toBe(false);
    expect(verdict(cleared, target).visible).toBe(true);
  });

  it('前方低矮格（高度 0）即使在前也不列为首个命中；只由后方高格命中', () => {
    // 视线沿 x 轴：(1,0) 在前（平面入点 t=1/4），(3,0) 在后（入点 t=5/8）。
    const board = computeBoard(
      4,
      observer,
      [A(3, 0), A(1, 0)],
      1,
      profile({ '1,0': 0, '3,0': 4 }, 1, 1),
    );
    const v = verdict(board, A(4, 0));
    expect(v.visible).toBe(false);
    expect(v.hits.map((h) => h.cell)).toEqual([A(3, 0)]);
    expect(v.first?.cell).toEqual(A(3, 0));
    expect(v.first?.t.toString()).toBe('5/8');
  });

  it('前方柱顶恰被视线擦过（严格）不遮挡，更高才挡', () => {
    // 眼高 0→8 线性爬升；在进入 (1,0) 的 t=1/4 处视线高 2。柱高恰为 2：
    // 进入瞬间触顶，随后严格高于柱顶，全程不“严格低于柱顶”，不遮挡。
    const graze = computeBoard(4, observer, [middle], 1, profile({ '1,0': 2 }, 0, 8));
    expect(verdict(graze, target).hits).toHaveLength(0);
    // 柱高 3：t<3/8 段低于柱顶，与平面区间相交，交入参数仍为平面入点 1/4。
    const hit = computeBoard(4, observer, [middle], 1, profile({ '1,0': 3 }, 0, 8));
    const v = verdict(hit, target);
    expect(v.visible).toBe(false);
    expect(v.first?.t.toString()).toBe('1/4');
    expect(v.first?.point.x.toString()).toBe('1');
  });

  it('俯视（视线爬升越过柱顶）只在柱体前段遮挡，交入点为平面入点', () => {
    // z(t)=0+8t，柱高 4：低于柱顶要求 t<1/2；平面区间 (1/4,3/4)，交 (1/4,1/2) 非空。
    const board = computeBoard(4, observer, [middle], 1, profile({ '1,0': 4 }, 0, 8));
    const v = verdict(board, target);
    expect(v.visible).toBe(false);
    expect(v.first?.cell).toEqual(middle);
    expect(v.first?.t.toString()).toBe('1/4');
    expect(v.first?.point.x.toString()).toBe('1');
  });

  it('仰视（视线下降）交入点按高度交点后移，给有理位置', () => {
    // z(t)=8−8t，柱高 4：低于柱顶要求 t>1/2；平面区间 (1/4,3/4)，交 (1/2,3/4)。
    const board = computeBoard(4, observer, [middle], 1, profile({ '1,0': 4 }, 8, 0));
    const v = verdict(board, target);
    expect(v.visible).toBe(false);
    expect(v.first?.cell).toEqual(middle);
    expect(v.first?.t.toString()).toBe('1/2');
    expect(v.first?.point.x.toString()).toBe('2'); // (0,0)+(4,0)·1/2 = (2,0)
    expect(v.first?.point.y.toString()).toBe('0');
  });

  it('仰视时视线始终高于柱顶则不遮挡（如全程贴柱顶或更高）', () => {
    // 眼高 8→8 等高、柱高 8：整段触顶，严格低于柱顶不成立。
    const touch = computeBoard(4, observer, [middle], 1, profile({ '1,0': 8 }, 8, 8));
    expect(verdict(touch, target).hits).toHaveLength(0);
  });

  it('高度判定在缩放下保持一致（t 与可见性不变）', () => {
    const hp = profile({ '1,0': 4, '3,0': 0 }, 8, 0);
    const base = computeBoard(4, observer, [A(1, 0), A(3, 0)], 1, hp);
    for (const scale of [2, 3, 7, 1000]) {
      const scaled = computeBoard(4, observer, [A(1, 0), A(3, 0)], scale, hp);
      for (const cell of base.cells) {
        const a = verdict(base, cell);
        const b = verdict(scaled, cell);
        expect(b.visible).toBe(a.visible);
        expect(b.hits.map((h) => keyOf(h.cell))).toEqual(a.hits.map((h) => keyOf(h.cell)));
        for (let i = 0; i < a.hits.length; i++) {
          expect(b.hits[i].t.cmp(a.hits[i].t)).toBe(0);
        }
      }
    }
  });
});

describe('边界语义', () => {
  it('目标格本身是阻挡格时，开线段仍穿过其内部', () => {
    const board = computeBoard(3, A(0, 0), [A(2, 0)]);
    const v = verdict(board, A(2, 0));
    expect(v.visible).toBe(false);
    expect(v.first?.cell).toEqual(A(2, 0));
    expect(v.first?.t.toString()).toBe('3/4'); // 进入点 (3, 0)
    expect(v.first?.point.x.toString()).toBe('3');
    expect(v.first?.point.y.toString()).toBe('0');
  });
});

describe('对拍：独立有理线段裁剪（半径 2 小棋盘）', () => {
  const radius = 2;
  const cells = boardCells(radius);

  const mainSide = (observer: Axial, target: Axial, blockers: Axial[]) => {
    const O = centerOf(observer);
    const C = centerOf(target);
    const D = { x: C.x - O.x, y: C.y - O.y };
    return blockers
      .map((cell) => ({ cell, t: hexEntry(O, D, halfPlanesOf(cell)) }))
      .filter((h): h is { cell: Axial; t: Rat } => h.t !== null)
      .sort((a, b) => {
        const dt = a.t.cmp(b.t);
        return dt !== 0 ? dt : a.cell.q - b.cell.q || a.cell.r - b.cell.r;
      });
  };

  const independentSide = (observer: Axial, target: Axial, blockers: Axial[]) => {
    const O = centerOf(observer);
    const C = centerOf(target);
    return blockers
      .map((cell) => ({ cell, t: independentCellEntry(O, C, cell) }))
      .filter((h): h is { cell: Axial; t: Frac } => h.t !== null)
      .sort((a, b) => {
        const dt = cmpFrac(a.t, b.t);
        return dt !== 0 ? dt : a.cell.q - b.cell.q || a.cell.r - b.cell.r;
      });
  };

  // 返回不一致描述；一致时返回 null
  function findMismatch(observer: Axial, target: Axial, blockers: Axial[]): string | null {
    const m = mainSide(observer, target, blockers);
    const i = independentSide(observer, target, blockers);
    const ctx = `O=${keyOf(observer)} T=${keyOf(target)} B=[${blockers.map(keyOf).join(' ')}]`;
    if (m.length !== i.length) {
      return `${ctx}: 遮挡数不同 主=${m.map((h) => keyOf(h.cell))} 独=${i.map((h) => keyOf(h.cell))}`;
    }
    for (let k = 0; k < m.length; k++) {
      if (keyOf(m[k].cell) !== keyOf(i[k].cell)) {
        return `${ctx}: 第 ${k} 个遮挡格不同 主=${keyOf(m[k].cell)} 独=${keyOf(i[k].cell)}`;
      }
      if (m[k].t.n !== i[k].t[0] || m[k].t.d !== i[k].t[1]) {
        return `${ctx}: ${keyOf(m[k].cell)} 交入参数不同 主=${m[k].t} 独=${i[k].t[0]}/${i[k].t[1]}`;
      }
    }
    return null;
  }

  it('全部单阻挡与阻挡对', { timeout: 120_000 }, () => {
    let mismatch: string | null = null;
    for (const observer of cells) {
      for (const target of cells) {
        if (keyOf(target) === keyOf(observer)) continue;
        const pool = cells.filter(
          (c) => keyOf(c) !== keyOf(observer) && keyOf(c) !== keyOf(target),
        );
        for (const b1 of pool) {
          mismatch ??= findMismatch(observer, target, [b1]);
        }
        for (let a = 0; a < pool.length; a++) {
          for (let b = a + 1; b < pool.length; b++) {
            mismatch ??= findMismatch(observer, target, [pool[a], pool[b]]);
          }
        }
      }
    }
    expect(mismatch).toBeNull();
  });

  it(' seeded 随机阻挡集', () => {
    let seed = 0x2f6e2b1;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    let mismatch: string | null = null;
    for (let iter = 0; iter < 400; iter++) {
      const observer = cells[Math.floor(rand() * cells.length)];
      let target = cells[Math.floor(rand() * cells.length)];
      while (keyOf(target) === keyOf(observer)) {
        target = cells[Math.floor(rand() * cells.length)];
      }
      const size = 3 + Math.floor(rand() * 5);
      const set = new Map<string, Axial>();
      while (set.size < size) {
        const c = cells[Math.floor(rand() * cells.length)];
        if (keyOf(c) !== keyOf(observer)) set.set(keyOf(c), c);
      }
      mismatch ??= findMismatch(observer, target, [...set.values()]);
    }
    expect(mismatch).toBeNull();
  });
});
