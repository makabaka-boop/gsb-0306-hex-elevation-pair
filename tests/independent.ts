// 独立实现：自带一份有理数运算与“临界参数 + 中点采样”的线段裁剪，
// 仅用于测试对拍，不引用 src/geometry 的任何算法代码（只取格点数据）。
import { centerOf, verticesOf } from '../src/geometry/hex';
import type { Axial } from '../src/geometry/hex';

export type Frac = readonly [bigint, bigint]; // 规范化：分母 > 0，互素

const g = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x === 0n ? 1n : x;
};

export const frac = (n: bigint, d: bigint = 1n): Frac => {
  let num = n;
  let den = d;
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const h = g(num, den);
  return [num / h, den / h];
};

export const cmpFrac = (a: Frac, b: Frac): number => {
  const l = a[0] * b[1];
  const r = b[0] * a[1];
  return l < r ? -1 : l > r ? 1 : 0;
};

const addF = (a: Frac, b: Frac): Frac => frac(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const subF = (a: Frac, b: Frac): Frac => frac(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const mulF = (a: Frac, b: Frac): Frac => frac(a[0] * b[0], a[1] * b[1]);

export interface Vec {
  x: bigint;
  y: bigint;
}

const vsub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a: Vec, b: Vec): bigint => a.x * b.y - a.y * b.x;

/** 严格内部：对每条边，点与格心在同侧且不压在边界直线上。 */
function strictlyInside(px: Frac, py: Frac, verts: Vec[], ctr: Vec): boolean {
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    const e = vsub(b, a);
    const toward = cross(e, vsub(ctr, a));
    // cross(e, P − a)，P 为有理点
    const cpx = subF(
      mulF(frac(e.x), subF(py, frac(a.y))),
      mulF(frac(e.y), subF(px, frac(a.x))),
    );
    if (cpx[0] === 0n) return false; // 压在边界直线上
    if (cpx[0] > 0n !== toward > 0n) return false;
  }
  return true;
}

/**
 * 独立裁剪：收集直线与每条边所在直线的交点参数，连同 0、1 排序去重，
 * 对每个开子区间取中点做严格内部判定。返回交入参数（≥ 0），或 null。
 */
export function independentEntry(O: Vec, C: Vec, verts: Vec[], ctr: Vec): Frac | null {
  const D = vsub(C, O);
  const crit: Frac[] = [frac(0n), frac(1n)];
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    const e = vsub(b, a);
    const c0 = cross(e, vsub(O, a));
    const c1 = cross(e, D);
    if (c1 !== 0n) crit.push(frac(-c0, c1));
  }
  crit.sort(cmpFrac);
  const ts: Frac[] = [];
  for (const t of crit) {
    if (ts.length === 0 || cmpFrac(ts[ts.length - 1], t) !== 0) ts.push(t);
  }
  const zero = frac(0n);
  const one = frac(1n);
  for (let i = 0; i + 1 < ts.length; i++) {
    const lo = cmpFrac(ts[i], zero) > 0 ? ts[i] : zero;
    const hi = cmpFrac(ts[i + 1], one) < 0 ? ts[i + 1] : one;
    if (cmpFrac(lo, hi) >= 0) continue;
    const mid = mulF(addF(lo, hi), frac(1n, 2n));
    const px = addF(frac(O.x), mulF(mid, frac(D.x)));
    const py = addF(frac(O.y), mulF(mid, frac(D.y)));
    if (strictlyInside(px, py, verts, ctr)) return lo;
  }
  return null;
}

/** 便于测试直接以格为单位调用。 */
export function independentCellEntry(O: Vec, C: Vec, cell: Axial): Frac | null {
  return independentEntry(O, C, verticesOf(cell), centerOf(cell));
}
