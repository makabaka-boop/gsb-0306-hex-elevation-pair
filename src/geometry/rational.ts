const abs = (a: bigint): bigint => (a < 0n ? -a : a);

function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0n ? 1n : x;
}

/**
 * 精确有理数，始终规范化：分母为正、分子分母互素。
 * 全部运算在 bigint 上完成，与屏幕像素和缩放无关。
 */
export class Rat {
  private constructor(
    readonly n: bigint,
    readonly d: bigint,
  ) {}

  static of(n: bigint | number, d: bigint | number = 1n): Rat {
    let num = BigInt(n);
    let den = BigInt(d);
    if (den === 0n) throw new Error('Rat: zero denominator');
    if (den < 0n) {
      num = -num;
      den = -den;
    }
    const g = gcd(num, den);
    return new Rat(num / g, den / g);
  }

  add(o: Rat): Rat {
    return Rat.of(this.n * o.d + o.n * this.d, this.d * o.d);
  }

  mul(o: Rat): Rat {
    return Rat.of(this.n * o.n, this.d * o.d);
  }

  cmp(o: Rat): number {
    const l = this.n * o.d;
    const r = o.n * this.d;
    return l < r ? -1 : l > r ? 1 : 0;
  }

  toNumber(): number {
    return Number(this.n) / Number(this.d);
  }

  toString(): string {
    return this.d === 1n ? this.n.toString() : `${this.n}/${this.d}`;
  }
}
