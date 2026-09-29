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
 * 开线段 (O, O+D) 与六边形严格内部的相交参数开区间 (lo, hi)。
 * 纯边界接触（擦角、沿边）时区间为空，返回 null。
 * 全程用整数交叉相乘比较，不做任何浮点运算。
 */
export function hexSpan(O: IPoint, D: IPoint, planes: HalfPlane[]): { lo: Rat; hi: Rat } | null {
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
  return { lo: Rat.of(ln, ld), hi: Rat.of(hn, hd) };
}

/**
 * 开线段 (O, O+D) 进入六边形严格内部的参数 t ∈ [0, 1)。
 * 纯边界接触（擦角、沿边）不算遮挡，返回 null。
 */
export function hexEntry(O: IPoint, D: IPoint, planes: HalfPlane[]): Rat | null {
  return hexSpan(O, D, planes)?.lo ?? null;
}

/** 比较视线在 t 处的高度与柱顶高度：严格低于柱顶才算在柱内。 */
function belowTop(t: Rat, observerEye: bigint, targetEye: bigint, height: bigint): boolean {
  // h(t) = observerEye·d + n·(targetEye − observerEye)  （公分母 t.d）
  const h = observerEye * t.d + t.n * (targetEye - observerEye);
  return h < height * t.d;
}

/**
 * 视线与竖直柱体（六边形截面 × [0, 柱顶]）的第一次相交参数。
 * 视线高度沿开线段线性变化：h(t) = observerEye + t·(targetEye − observerEye)。
 * 只有“在六边形严格内部且严格低于柱顶”的部分才算遮挡：
 * 擦六边形边界（span 为 null）、恰好贴柱顶滑过、柱高 0 均不遮挡。
 * 俯视进入时先在柱顶上空，交点落在柱顶平面，t 由 h(t) = height 精确解出。
 */
export function columnEntry(
  O: IPoint,
  D: IPoint,
  planes: HalfPlane[],
  height: number,
  observerEye: number,
  targetEye: number,
): Rat | null {
  const span = hexSpan(O, D, planes);
  if (span === null) return null;
  const H = BigInt(height);
  const oe = BigInt(observerEye);
  const te = BigInt(targetEye);
  if (H <= 0n) return null; // 高度 0 的格子不遮挡

  if (te === oe) {
    // 视线水平：全程同高，严格低于柱顶时在入六边形点 lo 处首次相交。
    return oe < H ? span.lo : null;
  }
  if (te > oe) {
    // 仰视：高度单调上升。入六边形即低于柱顶才遮挡；
    // h(lo) 恰为柱顶时，此后全程在柱顶之上（仅触顶），不遮挡。
    return belowTop(span.lo, oe, te, H) ? span.lo : null;
  }
  // 俯视：高度单调下降。出六边形前严格低于柱顶才遮挡；
  // h(hi) 恰为柱顶时，内部全程高于柱顶（仅在边界触顶），不遮挡。
  if (!belowTop(span.hi, oe, te, H)) return null;
  if (belowTop(span.lo, oe, te, H)) return span.lo;
  // 入六边形时在柱顶之上：穿过柱顶平面 h(t) = H 进入柱内。
  // t = (oe − H) / (oe − te)，两数均非负（H 介于 h(hi) 与 h(lo) 之间）。
  return Rat.of(oe - H, oe - te);
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
 * 穿过了哪些阻挡柱体的内部。画布与列表共用这一份结果。
 *
 * 提供 heights 时按高度视线判定（柱高 0 不遮挡，视线可越过矮柱，
 * 俯视时交点在柱顶平面）；省略时退化为无限高墙的纯平面判定，
 * 供既有平面几何用例与对拍使用。
 */
export function computeBoard(
  radius: number,
  observer: Axial,
  blockers: readonly Axial[],
  scale = 1,
  heights?: HeightProfile,
): BoardResult {
  const cells = boardCells(radius);
  const O = centerOf(observer, scale);
  const data = blockers.map((cell) => ({
    cell,
    planes: halfPlanesOf(cell, scale),
    height: heights?.blockerHeights.get(keyOf(cell)) ?? 4,
  }));
  const verdicts = new Map<string, CellVerdict>();
  for (const target of cells) {
    const key = keyOf(target);
    if (target.q === observer.q && target.r === observer.r) {
      verdicts.set(key, { cell: target, visible: true, hits: [], first: null });
      continue;
    }
    const C = centerOf(target, scale);
    const D: IPoint = { x: C.x - O.x, y: C.y - O.y };
    const oe = heights?.observerEye ?? 0;
    const te = heights?.targetEye ?? 0;
    const hits: BlockHit[] = [];
    for (const { cell, planes, height } of data) {
      const t = heights
        ? columnEntry(O, D, planes, height, oe, te)
        : hexEntry(O, D, planes);
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
