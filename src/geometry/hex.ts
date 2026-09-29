/** 轴坐标格。 */
export interface Axial {
  q: number;
  r: number;
}

export const keyOf = (c: Axial): string => `${c.q},${c.r}`;

/** 半径 radius 的六角棋盘（|q|、|r|、|q+r| 均不超过 radius），按 (q, r) 排序。 */
export function boardCells(radius: number): Axial[] {
  const cells: Axial[] = [];
  for (let q = -radius; q <= radius; q++) {
    const lo = Math.max(-radius, -q - radius);
    const hi = Math.min(radius, -q + radius);
    for (let r = lo; r <= hi; r++) cells.push({ q, r });
  }
  return cells;
}

/** 整数平面上的点。 */
export interface IPoint {
  x: bigint;
  y: bigint;
}

/** 格心整数嵌入：(2q + r, 3r)。scale 用于缩放不变性检验。 */
export function centerOf(c: Axial, scale = 1): IPoint {
  const k = BigInt(scale);
  return { x: BigInt(2 * c.q + c.r) * k, y: BigInt(3 * c.r) * k };
}

/** 顶点相对格心的偏移，顺序固定。 */
export const VERTEX_OFFSETS = [
  [0, 2],
  [1, 1],
  [1, -1],
  [0, -2],
  [-1, -1],
  [-1, 1],
] as const;

export function verticesOf(c: Axial, scale = 1): IPoint[] {
  const k = BigInt(scale);
  const ctr = centerOf(c, scale);
  return VERTEX_OFFSETS.map(([dx, dy]) => ({
    x: ctr.x + BigInt(dx) * k,
    y: ctr.y + BigInt(dy) * k,
  }));
}

/** 半平面：严格内部 ⇔ nx·x + ny·y < c。 */
export interface HalfPlane {
  nx: bigint;
  ny: bigint;
  c: bigint;
}

const planeCache = new Map<string, HalfPlane[]>();

/** 六边形的六个外法向半平面（内部为严格小于的一侧）。 */
export function halfPlanesOf(c: Axial, scale = 1): HalfPlane[] {
  const cacheKey = `${c.q},${c.r}@${scale}`;
  const cached = planeCache.get(cacheKey);
  if (cached) return cached;
  const vs = verticesOf(c, scale);
  const ctr = centerOf(c, scale);
  const planes: HalfPlane[] = [];
  for (let i = 0; i < 6; i++) {
    const a = vs[i];
    const b = vs[(i + 1) % 6];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    let nx = -ey;
    let ny = ex;
    let cc = nx * a.x + ny * a.y;
    // 保证法向朝外：格心必须落在严格内侧。
    if (nx * ctr.x + ny * ctr.y > cc) {
      nx = -nx;
      ny = -ny;
      cc = -cc;
    }
    planes.push({ nx, ny, c: cc });
  }
  planeCache.set(cacheKey, planes);
  return planes;
}
