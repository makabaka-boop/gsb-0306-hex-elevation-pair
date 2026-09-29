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
  const iv = clipPlanes(O, D, planes);
  return iv === null ? null : iv.lo;
}

/** 六条边半平面裁剪得到的开区间 (lo, hi)；为空返回 null。 */
function clipPlanes(
  O: IPoint,
  D: IPoint,
  planes: HalfPlane[],
): { lo: Rat; hi: Rat } | null {
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
 * 在六边形严格内部的基础上叠加高度条件：视线高度
 * z(t) = observerEye + (targetEye − observerEye)·t 必须严格低于柱顶 height。
 * 高度条件同样裁剪为一个开 t 区间，与平面区间取交；交集非空才算遮挡，
 * 返回交集的下界（真实的“交入参数”）。恰好触顶、只在边界处等高都不算。
 * 格子高度 0（柱顶贴地）对任何视线都不遮挡。
 */
export function hexEntryHeight(
  O: IPoint,
  D: IPoint,
  planes: HalfPlane[],
  height: number,
  observerEye: number,
  targetEye: number,
): Rat | null {
  const iv = clipPlanes(O, D, planes);
  if (iv === null) return null;
  const h = Rat.of(height);
  const z0 = Rat.of(observerEye);
  const z1 = Rat.of(targetEye);
  // z(t) < h：
  //   z1 > z0 时 ⇒ t < (h−z0)/(z1−z0)（视线爬升，高出该点才越过柱顶）
  //   z1 < z0 时 ⇒ t > (z0−h)/(z0−z1)（视线下降，低过该点才低于柱顶）
  //   z1 = z0 时，整段等高：低于柱顶则全程可穿，触顶/超高则全程不穿。
  if (z1.cmp(z0) > 0) {
    const tHi = h.sub(z0).div(z1.sub(z0));
    if (iv.lo.cmp(tHi) >= 0) return null;
    return iv.lo;
  }
  if (z1.cmp(z0) < 0) {
    const tLo = z0.sub(h).div(z0.sub(z1));
    if (iv.hi.cmp(tLo) <= 0) return null;
    return maxRat(iv.lo, tLo);
  }
  if (z0.cmp(h) >= 0) return null; // 等高视线触顶或高于柱顶
  return iv.lo;
}

const maxRat = (a: Rat, b: Rat): Rat => (a.cmp(b) >= 0 ? a : b);

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

const clampHeight = (v: number): number => Math.min(8, Math.max(0, Math.round(v)));

/**
 * 整盘可见性：对每个目标格，求观察点格心到目标格心的开线段
 * 穿过了哪些阻挡六边形的内部（且在该处视线严格低于柱顶）。
 * 画布与列表共用这一份结果。
 *
 * 不传 heights 时退化为纯平面判定（柱体视为无限高），用于无高度场景与旧测试。
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
    height: heights ? clampHeight(heights.blockerHeights.get(keyOf(cell)) ?? 4) : null,
  }));
  const observerEye = heights ? clampHeight(heights.observerEye) : 0;
  const targetEye = heights ? clampHeight(heights.targetEye) : 0;
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
    for (const { cell, planes, height } of data) {
      const t =
        height === null
          ? hexEntry(O, D, planes)
          : hexEntryHeight(O, D, planes, height, observerEye, targetEye);
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
