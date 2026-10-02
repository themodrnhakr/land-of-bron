import { describe, expect, test } from "bun:test";
import * as Random from "./Random.ts";

describe("nextRandom", () => {
  test("is deterministic and returns a value in [0, 1) plus a new seed", () => {
    const [a, seedA] = Random.nextRandom(12345);
    const [b, seedB] = Random.nextRandom(12345);
    expect(a).toBe(b);
    expect(seedA).toBe(seedB);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
  });

  test("advances the seed so successive draws differ", () => {
    const [a, seedA] = Random.nextRandom(0);
    const [b] = Random.nextRandom(seedA);
    expect(a).not.toBe(b);
  });
});

describe("shuffle", () => {
  test("returns a permutation of the input", () => {
    const input = [1, 2, 3, 4, 5];
    const [out] = Random.shuffle(input, 7);
    expect([...out].sort()).toEqual([...input].sort());
    expect(input).toEqual([1, 2, 3, 4, 5]); // input untouched
  });

  test("is deterministic for a given seed", () => {
    expect(Random.shuffle([1, 2, 3, 4, 5], 99)[0]).toEqual(Random.shuffle([1, 2, 3, 4, 5], 99)[0]);
  });

  test("handles empty and single-element arrays", () => {
    expect(Random.shuffle([], 1)[0]).toEqual([]);
    expect(Random.shuffle([42], 1)[0]).toEqual([42]);
  });
});

describe("weightedDraw", () => {
  const pool = [{ id: "a", w: 3 }, { id: "b", w: 1 }];

  test("draws exactly `count` items without replacement", () => {
    const [first, ...rest] = [0, 1, 2, 3].map((seed) =>
      Random.weightedDraw(pool, (p) => p.w, 4, seed).picked.map((p) => p.id)
    );
    for (const picked of [first!, ...rest]) {
      expect(picked).toHaveLength(4);
      // b has weight 1, so it can appear at most once.
      expect(picked.filter((id) => id === "b").length).toBeLessThanOrEqual(1);
      expect(picked.filter((id) => id === "a").length).toBeGreaterThanOrEqual(3);
    }
  });

  test("stops early when the pool is exhausted", () => {
    const { picked } = Random.weightedDraw(pool, (p) => p.w, 10, 1);
    expect(picked).toHaveLength(4);
  });

  test("is deterministic for a given seed", () => {
    expect(Random.weightedDraw(pool, (p) => p.w, 3, 5).picked).toEqual(
      Random.weightedDraw(pool, (p) => p.w, 3, 5).picked,
    );
  });
});

describe("nationSeed", () => {
  test("gives each nation a distinct stream from one match seed", () => {
    const seeds = new Set([0, 1, 2, 3].map((id) => Random.nationSeed(42, id)));
    expect(seeds.size).toBe(4);
  });
});
