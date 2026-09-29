import { Rat } from './rational';
import { boardCells, centerOf, halfPlanesOf, keyOf } from './hex';
import type { Axial, HalfPlane, IPoint } from './hex';

/** 有理点（交入位置）。 */
export interface RatPoint {
  x: Rat;
  y: Rat;
}

/** 一次遮挡：阻挡格、交入参数 t 与有理交入位置。 */
export interface BlockHit {
  cell: Axial;
  t: Rat;
  point: RatPoint;
}

/**
 * 开线段 (O, O+D) 进入六边形严格内部的参数 t ∈ [0, 1)。
 * 纯边界接触（擦角、沿边）不算遮挡，返回 null。
 * 全程用整数交叉相乘比较，不做任何浮点运算。
 */
export function hexEntry(O: IPoint, D: IPoint, planes: HalfPlane[]): Rat | null {
  let ln = 0n;
  let ld = 1n; // 下界 lo = ln / ld（ld > 0），初值 0（开线段起点）
  let hn = 1n;
  let hd = 1n; // 上界 hi = hn / hd（hd > 0），初值 1（开线段终点）
  for (const hp of planes) {
    const num = hp.c - hp.nx * O.x - hp.ny * O.y; // c − n·O
    const den = hp.nx * D.x + hp.ny * D.y; // n·D
    if (den === 0n) {
      // 与边平行：整段在该边界直线上或外侧时，永远进不了严格内部。
      if (num <= 0n) return null;
      continue;
    }
    let n = num;
    let d = den;
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    if (den > 0n) {
      // n·P(t) < c ⇔ t < n/d —— 出界候选
      if (n * hd < hn * d) {
        hn = n;
        hd = d;
      }
    } else {
      // n·P(t) < c ⇔ t > n/d —— 入界候选
      if (n * ld > ln * d) {
        ln = n;
        ld = d;
      }
    }
    if (ln * hd >= hn * ld) return null; // 开区间 (lo, hi) 已为空
  }
  return Rat.of(ln, ld);
}

/** 线段上参数 t 处的有理点。 */
export function pointAt(O: IPoint, D: IPoint, t: Rat): RatPoint {
  return {
    x: Rat.of(O.x * t.d + t.n * D.x, t.d),
    y: Rat.of(O.y * t.d + t.n * D.y, t.d),
  };
}

/** 并列裁决：先交入位置 t，再 q，再 r。 */
export function compareHits(a: BlockHit, b: BlockHit): number {
  const dt = a.t.cmp(b.t);
  if (dt !== 0) return dt;
  if (a.cell.q !== b.cell.q) return a.cell.q - b.cell.q;
  return a.cell.r - b.cell.r;
}

export interface CellVerdict {
  cell: Axial;
  visible: boolean;
  hits: BlockHit[];
  first: BlockHit | null;
}

export interface BoardResult {
  radius: number;
  observer: Axial;
  cells: Axial[];
  verdicts: ReadonlyMap<string, CellVerdict>;
}

/** 格子上的遮挡高度，以及视线两端的眼高。未列出的阻挡格高度为 4。 */
export interface HeightProfile {
  observerEye: number;
  targetEye: number;
  blockerHeights: ReadonlyMap<string, number>;
}

/**
 * 整盘可见性：对每个目标格，求观察点格心到目标格心的开线段
 * 穿过了哪些阻挡六边形的内部。画布与列表共用这一份结果。
 */
export function computeBoard(
  radius: number,
  observer: Axial,
  blockers: readonly Axial[],
  scale = 1,
  _heights?: HeightProfile,
): BoardResult {
  const cells = boardCells(radius);
  const O = centerOf(observer, scale);
  const data = blockers.map((cell) => ({ cell, planes: halfPlanesOf(cell, scale) }));
  const verdicts = new Map<string, CellVerdict>();
  for (const target of cells) {
    const key = keyOf(target);
    if (target.q === observer.q && target.r === observer.r) {
      verdicts.set(key, { cell: target, visible: true, hits: [], first: null });
      continue;
    }
    const C = centerOf(target, scale);
    const D: IPoint = { x: C.x - O.x, y: C.y - O.y };
    const hits: BlockHit[] = [];
    for (const { cell, planes } of data) {
      const t = hexEntry(O, D, planes);
      if (t !== null) hits.push({ cell, t, point: pointAt(O, D, t) });
    }
    hits.sort(compareHits);
    verdicts.set(key, {
      cell: target,
      visible: hits.length === 0,
      hits,
      first: hits.length > 0 ? hits[0] : null,
    });
  }
  return { radius, observer, cells, verdicts };
}
