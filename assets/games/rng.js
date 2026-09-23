// Exact JS port of `fastrand` 2.4.1's `Rng` — the seeded generator the Rust
// enumerators use (katgpt-rs Cargo.lock pins fastrand 2.4.1). Porting it
// bit-exactly is what lets `enumerateStates(607, 100)` in flappy.js /
// lanes.js reproduce the committed fixture states in order; the golden test
// (flappy_lanes_golden.test.mjs) proves the parity on both streams.
//
// Source of truth: ~/.cargo/registry/src/*/fastrand-2.4.1/src/lib.rs
//   - gen_u64: wyrand v4.2 (wyhash constants)
//   - gen_u32: the LOW 32 bits of gen_u64
//   - gen_mod_u32: Lemire's bounded draw, rejection loop included
//   - i32(low..high): low + gen_mod_u32(high - low)   [the rng_integer! macro]
//
// Zero dependencies. BigInt carries the 64-bit state; every observable draw
// matches the Rust stream.

const WY_CONST_0 = 0x2d358dccaa6c78a5n;
const WY_CONST_1 = 0x8bb84b93962eacc9n;
const MASK64 = (1n << 64n) - 1n;
const TWO_POW_32 = 0x100000000;

export class Rng {
  /** fastrand::Rng::with_seed — the u64 seed IS the whole state. */
  constructor(seed) {
    this.s = BigInt(seed) & MASK64;
  }

  /** fn gen_u64 — wyrand v4.2: s = state + K0; t = s * (s ^ K1) as u128;
   * output = (t as u64) ^ (t >> 64). */
  genU64() {
    const s = (this.s + WY_CONST_0) & MASK64;
    this.s = s;
    const t = s * (s ^ WY_CONST_1); // ≤ 128-bit BigInt product, exact
    return ((t & MASK64) ^ (t >> 64n)) & MASK64;
  }

  /** fn gen_u32 — the low 32 bits of gen_u64. */
  genU32() {
    return Number(this.genU64() & 0xffffffffn);
  }

  /** fn gen_mod_u32 — a draw in 0..n, Lemire with the exact rejection
   * bound: t = n.wrapping_neg() % n = (2^32 - n) % n. */
  genModU32(n) {
    let r = this.genU32();
    let p = BigInt(r) * BigInt(n);
    let hi = Number(p >> 32n);
    let lo = Number(p & 0xffffffffn);
    if (lo < n) {
      const t = (TWO_POW_32 - n) % n;
      while (lo < t) {
        r = this.genU32();
        p = BigInt(r) * BigInt(n);
        hi = Number(p >> 32n);
        lo = Number(p & 0xffffffffn);
      }
    }
    return hi;
  }

  /** rng.u32(..n) — half-open range from 0. */
  u32Below(n) {
    return this.genModU32(n);
  }

  /** rng.i32(low..high) — half-open integer range; exactly the fastrand
   * macro's low + gen_mod_u32(high - low). */
  i32Range(low, highExcl) {
    return low + this.genModU32(highExcl - low);
  }
}
