import { describe, expect, test } from "bun:test";
import { Result } from "effect";
import * as Pieces from "./Pieces.ts";
import * as Setup from "./Setup.ts";

const expectOk = (data: unknown): Setup.ResolvedSetupOptions => {
  const result = Setup.decodeSetupOptions(data);
  if (Result.isFailure(result)) {
    throw new Error(`expected success, got ${JSON.stringify(result.failure)}`);
  }
  return result.success;
};

const expectErr = (data: unknown): Setup.SetupOptionsError => {
  const result = Setup.decodeSetupOptions(data);
  if (Result.isSuccess(result)) throw new Error("expected failure, got success");
  return result.failure;
};

describe("decodeSetupOptions: defaults", () => {
  test("fills in every field when given an empty object", () => {
    const opts = expectOk({});
    expect(opts.strategy).toBe(Setup.DEFAULT_STRATEGY);
    expect(opts.strategy).toBe("frontier");
    expect(opts.seed).toBe(0);
    expect(opts.target).toBe(7);
    expect(opts.noisePoolFraction).toBe(0.35);
    expect(opts.seedRingDist).toBe(2);
    expect(opts.growthCap).toBe(4);
    expect(opts.pieceLimits).toEqual(Pieces.PIECE_LIMITS);
    expect(opts.nationNames).toEqual([...Setup.DEFAULT_NATION_NAMES]);
    expect(opts.catalogVersion).toBeUndefined();
  });

  test("treats null and undefined as an empty object", () => {
    expect(expectOk(null)).toEqual(expectOk({}));
    expect(expectOk(undefined)).toEqual(expectOk({}));
  });

  test("ignores unknown top-level keys", () => {
    const opts = expectOk({ bogus: 1, another: "x" });
    expect(opts).toEqual(expectOk({}));
  });
});

describe("decodeSetupOptions: overrides", () => {
  test("passes through generation options", () => {
    const opts = expectOk({
      strategy: "lattice",
      seed: 99,
      target: 4,
      noisePoolFraction: 0.5,
      seedRingDist: 3,
      growthCap: 5,
    });
    expect(opts.strategy).toBe("lattice");
    expect(opts.seed).toBe(99);
    expect(opts.target).toBe(4);
    expect(opts.noisePoolFraction).toBe(0.5);
    expect(opts.seedRingDist).toBe(3);
    expect(opts.growthCap).toBe(5);
  });

  test("merges a partial pieceLimits override over the defaults", () => {
    const opts = expectOk({ pieceLimits: { influence: 3, units: 2 } });
    expect(opts.pieceLimits.influence).toBe(3);
    expect(opts.pieceLimits.units).toBe(2);
    // Untouched keys keep their defaults.
    expect(opts.pieceLimits.religion).toBe(Pieces.PIECE_LIMITS.religion);
    expect(opts.pieceLimits.controlChits).toBe(Pieces.PIECE_LIMITS.controlChits);
    expect(opts.pieceLimits.production).toBe(Pieces.PIECE_LIMITS.production);
    expect(opts.pieceLimits.population).toBe(Pieces.PIECE_LIMITS.population);
    expect(opts.pieceLimits.tradePosts).toBe(Pieces.PIECE_LIMITS.tradePosts);
  });

  test("rejects unknown keys inside pieceLimits (D14)", () => {
    const failure = expectErr({ pieceLimits: { influence: 3, bogus: 99 } });
    expect(failure._tag).toBe("InvalidSetupOptions");
  });

  test("rejects zero, negative, fractional and over-cap pieceLimits (D14)", () => {
    // The old `KNOWN GAP` test pinned acceptance of 0 and negatives; the caps
    // are now integers in [1, MAX_PIECE_LIMIT], which also closes the
    // `Array.from({ length: 1e9 })` allocation hazard.
    for (const bad of [0, -5, 2.5, Pieces.MAX_PIECE_LIMIT + 1, 1e9]) {
      expectErr({ pieceLimits: { influence: bad } });
    }
    // The bounds themselves are accepted.
    expect(expectOk({ pieceLimits: { influence: 1 } }).pieceLimits.influence).toBe(1);
    expect(expectOk({ pieceLimits: { influence: Pieces.MAX_PIECE_LIMIT } }).pieceLimits.influence)
      .toBe(Pieces.MAX_PIECE_LIMIT);
  });

  test("keeps a supplied nationNames list verbatim, short lists included", () => {
    const opts = expectOk({ nationNames: ["Solo"] });
    expect(opts.nationNames).toEqual(["Solo"]);
    expect(expectOk({ nationNames: [] }).nationNames).toEqual([]);
    expect(expectOk({ nationNames: ["A", "B", "C"] }).nationNames).toEqual(["A", "B", "C"]);
  });

  test("passes catalogVersion straight through", () => {
    expect(expectOk({ catalogVersion: "v9" }).catalogVersion).toBe("v9");
    expect(expectOk({}).catalogVersion).toBeUndefined();
  });
});

describe("decodeSetupOptions: generation range + cross-field validation (D14/D15)", () => {
  test("rejects a target below 1", () => {
    expectErr({ target: 0 });
    expectErr({ target: -1 });
    expectErr({ target: 1.5 });
    expect(expectOk({ target: 1 }).target).toBe(1);
  });

  test("rejects noisePoolFraction outside [0, 1]", () => {
    expectErr({ noisePoolFraction: -0.1 });
    expectErr({ noisePoolFraction: 1.1 });
    expect(expectOk({ noisePoolFraction: 0 }).noisePoolFraction).toBe(0);
    expect(expectOk({ noisePoolFraction: 1 }).noisePoolFraction).toBe(1);
  });

  test("rejects seedRingDist below 1", () => {
    expectErr({ seedRingDist: 0 });
    expectErr({ seedRingDist: -1 });
    expect(expectOk({ seedRingDist: 1 }).seedRingDist).toBe(1);
  });

  test("rejects growthCap below seedRingDist + 2", () => {
    expectErr({ seedRingDist: 3, growthCap: 4 });
    expect(expectOk({ seedRingDist: 3, growthCap: 5 }).growthCap).toBe(5);
  });
});

describe("decodeSetupOptions: malformed input", () => {
  test("rejects malformed input with InvalidSetupOptions", () => {
    const cases: Array<unknown> = [
      { strategy: "nope" },
      { strategy: 1 },
      { seed: "not a number" },
      { target: "seven" },
      { pieceLimits: "no" },
      { pieceLimits: { influence: "three" } },
      { nationNames: [1, 2] },
      { nationNames: "Red" },
      { catalogVersion: 7 },
      "not an object",
      42,
    ];
    for (const data of cases) {
      const failure = expectErr(data);
      expect(failure._tag).toBe("InvalidSetupOptions");
    }
  });

  test("formatSetupError returns a non-empty human-readable message", () => {
    const failure = expectErr({ strategy: "nope" });
    const message = Setup.formatSetupError(failure);
    expect(typeof message).toBe("string");
    expect(message.length).toBeGreaterThan(0);
  });
});
