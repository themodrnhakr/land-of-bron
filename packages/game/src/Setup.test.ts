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

// `PieceLimits` is `typeof PIECE_LIMITS`, so its fields are literal-typed
// (influence is exactly `8`) even though the decoder accepts any number and
// casts the merge result. Widen before asserting on overrides; see the note in
// the report about the `as PieceLimits` cast in Setup.ts.
const limitsOf = (opts: Setup.ResolvedSetupOptions): Record<string, number> => ({ ...opts.pieceLimits });

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
    expect(opts.terrain).toBe(Setup.DEFAULT_LAND_TERRAIN);
    expect(opts.terrain).toBe("plains");
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
      terrain: "forest",
    });
    expect(opts.strategy).toBe("lattice");
    expect(opts.seed).toBe(99);
    expect(opts.target).toBe(4);
    expect(opts.noisePoolFraction).toBe(0.5);
    expect(opts.seedRingDist).toBe(3);
    expect(opts.growthCap).toBe(5);
    expect(opts.terrain).toBe("forest");
  });

  test("merges a partial pieceLimits override over the defaults", () => {
    const opts = expectOk({ pieceLimits: { influence: 3, units: 2 } });
    const limits = limitsOf(opts);
    expect(limits.influence).toBe(3);
    expect(limits.units).toBe(2);
    // Untouched keys keep their defaults.
    expect(limits.religion).toBe(Pieces.PIECE_LIMITS.religion);
    expect(limits.controlChits).toBe(Pieces.PIECE_LIMITS.controlChits);
    expect(limits.production).toBe(Pieces.PIECE_LIMITS.production);
    expect(limits.population).toBe(Pieces.PIECE_LIMITS.population);
    expect(limits.tradePosts).toBe(Pieces.PIECE_LIMITS.tradePosts);
  });

  test("silently drops unknown keys inside pieceLimits", () => {
    const opts = expectOk({ pieceLimits: { influence: 3, bogus: 99 } });
    expect(limitsOf(opts)).toEqual({ ...Pieces.PIECE_LIMITS, influence: 3 });
    expect("bogus" in opts.pieceLimits).toBe(false);
  });

  test("KNOWN GAP: accepts zero and negative pieceLimits overrides", () => {
    // PLAN.md Phase 2 item 5 tightens this to integers >= 1 and removes the
    // `as PieceLimits` cast. This test documents today's behaviour so the
    // tightening is a visible, deliberate change.
    const opts = expectOk({ pieceLimits: { influence: 0, units: -5 } });
    expect(limitsOf(opts).influence).toBe(0);
    expect(limitsOf(opts).units).toBe(-5);
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

describe("decodeSetupOptions: malformed input", () => {
  test("rejects malformed input with InvalidSetupOptions", () => {
    const cases: Array<unknown> = [
      { strategy: "nope" },
      { strategy: 1 },
      { terrain: "lava" },
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
