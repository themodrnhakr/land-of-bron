// ============================================================================
// Seeded PRNG (shared by board generation and terrain selection)
// ============================================================================

/**
 * One step of the mulberry32 PRNG: given the current seed, produce a random
 * number in `[0, 1)` plus the next seed. Pure — the PRNG state is threaded
 * explicitly so every draw is reproducible from a single `seed`.
 */
export const nextRandom = (seed: number): readonly [number, number] => {
  const a = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a >>> 0];
};

/**
 * Fisher–Yates shuffle driven by the seeded PRNG. Returns the shuffled copy
 * and the advanced seed.
 */
export const shuffle = <A>(
  items: ReadonlyArray<A>,
  seed: number,
): readonly [Array<A>, number] => {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    const [roll, nextSeed] = nextRandom(s);
    s = nextSeed;
    const j = Math.floor(roll * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return [out, s];
};

/**
 * Draw `count` items without replacement, weighted by each item's `weight`.
 * Used for terrain selection (D23): the pool is the configured nation terrain
 * table and the weight is each type's remaining `tileCount`. Stops early if
 * the pool is exhausted (the caller is expected to have checked the pool is
 * large enough).
 */
export const weightedDraw = <A>(
  items: ReadonlyArray<A>,
  weightOf: (item: A) => number,
  count: number,
  seed: number,
): { readonly picked: ReadonlyArray<A>; readonly nextSeed: number } => {
  const remaining = items.map((item) => ({ item, weight: weightOf(item) }));
  const picked: Array<A> = [];
  let s = seed;
  for (let n = 0; n < count; n++) {
    const total = remaining.reduce((acc, r) => acc + r.weight, 0);
    if (total <= 0) break;
    const [roll, nextSeed] = nextRandom(s);
    s = nextSeed;
    let threshold = roll * total;
    let idx = 0;
    while (idx < remaining.length - 1 && threshold >= remaining[idx]!.weight) {
      threshold -= remaining[idx]!.weight;
      idx++;
    }
    const chosen = remaining[idx]!;
    picked.push(chosen.item);
    chosen.weight -= 1;
    if (chosen.weight <= 0) remaining.splice(idx, 1);
  }
  return { picked, nextSeed: s };
};

/** Derive a per-nation seed stream from the match seed + nation index. */
export const nationSeed = (seed: number, nationId: number): number => (seed + (nationId + 1) * 0x9e3779b1) >>> 0;
