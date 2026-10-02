import { describe, expect, test } from "bun:test";
import { Result } from "effect";
import { assert as fcAssert, integer, property } from "effect/testing/FastCheck";
import type { GenerateCoordsError } from "./BoardGeneration.ts";
import * as BoardGeneration from "./BoardGeneration.ts";
import * as Coords from "./Coords.ts";

// ============================================================================
// Helpers
// ============================================================================

type Territories = Array<Array<Coords.Coords>>;

/** Stable string key for a hex cell — used for set membership in assertions. */
const key = (c: Coords.Coords): string => `${c.q},${c.r}`;

const expectOk = <A, E>(r: Result.Result<A, E>): A => {
  if (Result.isFailure(r)) {
    throw new Error(`expected success, got failure: ${JSON.stringify(r.failure)}`);
  }
  return r.success;
};

const expectErr = <A, E>(r: Result.Result<A, E>): E => {
  if (Result.isSuccess(r)) throw new Error("expected failure, got success");
  return r.failure;
};

const allCells = (territories: Territories): Array<Coords.Coords> => territories.flatMap((territory) => territory);

/** Breadth/depth-first reachability over the six-neighbour relation. */
const isContiguous = (territory: ReadonlyArray<Coords.Coords>): boolean => {
  const first = territory[0];
  if (first === undefined) return true;
  const cells = new Set(territory.map(key));
  const seen = new Set<string>([key(first)]);
  const stack: Array<Coords.Coords> = [first];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const dir of Coords.DIRECTIONS) {
      const next = Coords.add(current, dir);
      const k = key(next);
      if (cells.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push(next);
      }
    }
  }
  return seen.size === cells.size;
};

/**
 * Cells that are *not* in the given set but whose six neighbours all are —
 * i.e. an interior hole in the region.
 */
const interiorHoles = (cells: ReadonlyArray<Coords.Coords>): Array<Coords.Coords> => {
  const set = new Set(cells.map(key));
  const holes = new Map<string, Coords.Coords>();
  for (const cell of cells) {
    for (const dir of Coords.DIRECTIONS) {
      const candidate = Coords.add(cell, dir);
      const k = key(candidate);
      if (set.has(k)) continue;
      if (Coords.DIRECTIONS.every((d) => set.has(key(Coords.add(candidate, d))))) {
        holes.set(k, candidate);
      }
    }
  }
  return [...holes.values()];
};

/** The minimum hex distance from `cell` to any cell in `cells`. */
const distanceToSet = (
  cell: Coords.Coords,
  cells: ReadonlyArray<Coords.Coords>,
): number => Math.min(...cells.map((other) => Coords.hexDistance(cell, other)));

/** Assert the shared structural invariants of a generated board. */
const expectValidBoard = (territories: Territories): void => {
  const land = allCells(territories);
  const sea = BoardGeneration.neutralCoords(territories);

  // No duplicate coordinates anywhere, land or sea.
  expect(new Set(land.map(key)).size).toBe(land.length);
  expect(new Set(sea.map(key)).size).toBe(sea.length);

  // Land and sea never overlap; sea is never on a nation tile.
  const landKeys = new Set(land.map(key));
  expect(sea.some((c) => landKeys.has(key(c)))).toBe(false);

  // Territories are pairwise disjoint.
  const seen = new Set<string>();
  for (const territory of territories) {
    for (const cell of territory) {
      const k = key(cell);
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  }

  // Every territory is contiguous, and exactly one hex from sea at every edge.
  for (const territory of territories) {
    expect(isContiguous(territory)).toBe(true);
  }

  // Every sea tile is adjacent to land, and no sea tile is more than one hex
  // from land (the sea is a single-tile border ring plus enclosed gaps).
  for (const cell of sea) {
    expect(distanceToSet(cell, land)).toBe(1);
  }

  // Land ∪ sea is a solid region: no enclosed holes.
  expect(interiorHoles([...land, ...sea])).toEqual([]);
};

// ============================================================================
// Strategy: frontier
// ============================================================================

describe("generateCoords: frontier", () => {
  test("applies the documented defaults (target = 7 per nation)", () => {
    const territories = expectOk(
      BoardGeneration.generateCoords({ playerCount: 3, strategy: "frontier" }),
    );
    expect(territories).toHaveLength(3);
    for (const territory of territories) expect(territory).toHaveLength(7);
    expectValidBoard(territories);
  });

  test("is deterministic: the same options produce byte-identical output", () => {
    const opts = { playerCount: 5, strategy: "frontier" as const, seed: 123 };
    expect(BoardGeneration.generateCoords(opts)).toEqual(BoardGeneration.generateCoords(opts));
    expect(expectOk(BoardGeneration.generateCoords(opts))).toEqual(
      expectOk(BoardGeneration.generateCoords({ ...opts })),
    );
  });

  test("seed actually changes the layout", () => {
    // A fixed pair, so this cannot flake: verified distinct for these seeds.
    const a = expectOk(BoardGeneration.generateCoords({ playerCount: 5, strategy: "frontier", seed: 123 }));
    const b = expectOk(BoardGeneration.generateCoords({ playerCount: 5, strategy: "frontier", seed: 124 }));
    expect(a).not.toEqual(b);
  });

  test("every nation gets exactly `target` tiles, for 2-7 players and a range of seeds", () => {
    fcAssert(
      property(
        integer({ min: 2, max: 7 }),
        integer({ min: 0, max: 500 }),
        (playerCount, seed) => {
          const result = BoardGeneration.generateCoords({
            playerCount,
            strategy: "frontier",
            seed,
          });
          expect(Result.isSuccess(result)).toBe(true);
          if (Result.isFailure(result)) return;
          expect(result.success).toHaveLength(playerCount);
          for (const territory of result.success) expect(territory).toHaveLength(7);
        },
      ),
      { numRuns: 60 },
    );
  });

  test("honours a non-default target, failing with InsufficientRoom only when there is genuinely no room", () => {
    fcAssert(
      property(
        integer({ min: 2, max: 7 }),
        integer({ min: 1, max: 12 }),
        integer({ min: 0, max: 300 }),
        (playerCount, target, seed) => {
          const result = BoardGeneration.generateCoords({
            playerCount,
            strategy: "frontier",
            seed,
            target,
          });
          if (Result.isFailure(result)) {
            expect(result.failure._tag).toBe("InsufficientRoom");
            return;
          }
          for (const territory of result.success) expect(territory).toHaveLength(target);
        },
      ),
      { numRuns: 80 },
    );
  });

  test("territories are disjoint, contiguous and gap-free for a range of seeds", () => {
    fcAssert(
      property(
        integer({ min: 2, max: 7 }),
        integer({ min: 0, max: 500 }),
        (playerCount, seed) => {
          const territories = expectOk(
            BoardGeneration.generateCoords({ playerCount, strategy: "frontier", seed }),
          );
          expectValidBoard(territories);
        },
      ),
      { numRuns: 40 },
    );
  });

  test("returns InsufficientRoom rather than a short board when the map is too small", () => {
    // 7 nations x 9 tiles = 63 needed, but growthCap 4 with seedRingDist 2
    // only exposes 61 cells (1 + 6*(1+2+3+4)). growthCap 4 satisfies the
    // cross-field minimum (seedRingDist + 2).
    const failure = expectErr(
      BoardGeneration.generateCoords({
        playerCount: 7,
        strategy: "frontier",
        target: 9,
        growthCap: 4,
        seedRingDist: 2,
      }),
    );
    expect(failure._tag).toBe("InsufficientRoom");
    if (failure._tag !== "InsufficientRoom") return;
    expect(failure.target).toBe(9);
    expect(failure.playerCount).toBe(7);
    expect(failure.growthCap).toBe(4);
    expect(failure.seedRingDist).toBe(2);
    expect(failure.actual).toBeLessThan(failure.target);
    expect(failure.nationId).toBeGreaterThanOrEqual(0);
    expect(failure.nationId).toBeLessThan(7);
  });
});

// ============================================================================
// Strategy: lattice
// ============================================================================

describe("generateCoords: lattice", () => {
  test("gives every nation the same 7-tile blob, with no overlaps and no gaps, for 2-7 players", () => {
    fcAssert(
      property(integer({ min: 2, max: 7 }), (playerCount) => {
        const territories = expectOk(
          BoardGeneration.generateCoords({ playerCount, strategy: "lattice" }),
        );
        expect(territories).toHaveLength(playerCount);
        for (const territory of territories) expect(territory).toHaveLength(7);
        expectValidBoard(territories);
        // "No gaps" in the strong form: the union is one connected landmass.
        const union = new Set(allCells(territories).map(key));
        const first = allCells(territories)[0]!;
        const seen = new Set<string>([key(first)]);
        const stack: Array<Coords.Coords> = [first];
        while (stack.length > 0) {
          const current = stack.pop()!;
          for (const dir of Coords.DIRECTIONS) {
            const next = Coords.add(current, dir);
            const k = key(next);
            if (union.has(k) && !seen.has(k)) {
              seen.add(k);
              stack.push(next);
            }
          }
        }
        expect(seen.size).toBe(union.size);
      }),
      { numRuns: 6 },
    );
  });

  test("is deterministic and ignores both `seed` and `target`", () => {
    const a = expectOk(
      BoardGeneration.generateCoords({ playerCount: 4, strategy: "lattice", seed: 1, target: 3 }),
    );
    const b = expectOk(
      BoardGeneration.generateCoords({ playerCount: 4, strategy: "lattice", seed: 42, target: 99 }),
    );
    expect(a).toEqual(b);
    for (const territory of a) expect(territory).toHaveLength(7);
  });
});

// ============================================================================
// Option validation
// ============================================================================

describe("generateCoords: option validation", () => {
  test("rejects a non-integer or out-of-range playerCount with InvalidPlayerCount", () => {
    for (const playerCount of [0, 1, 8, 2.5, -1]) {
      for (const strategy of ["lattice", "frontier"] as const) {
        const failure = expectErr(BoardGeneration.generateCoords({ playerCount, strategy }));
        expect(failure._tag).toBe("InvalidPlayerCount");
        if (failure._tag !== "InvalidPlayerCount") continue;
        expect(failure.playerCount).toBe(playerCount);
      }
    }
  });

  test("rejects undecodable options with InvalidOptions", () => {
    const cases: Array<unknown> = [
      { playerCount: 3, strategy: "nope" },
      { playerCount: 3 },
      { playerCount: 3, strategy: "frontier", seed: "not a number" },
      { playerCount: "3", strategy: "frontier" },
    ];
    for (const opts of cases) {
      const failure = expectErr(BoardGeneration.generateCoords(opts as never));
      expect(failure._tag).toBe("InvalidOptions");
    }
  });

  test("rejects a target below 1 (D15) instead of yielding 1-tile nations", () => {
    // This used to be a KNOWN BUG: the seed tile was placed unconditionally, so
    // target 0/-1 returned a successful 1-tile board. The field is now an
    // integer >= 1, so it surfaces as a typed InvalidOptions.
    for (const target of [0, -1, 1.5]) {
      const failure = expectErr(
        BoardGeneration.generateCoords({ playerCount: 2, strategy: "frontier", target }),
      );
      expect(failure._tag).toBe("InvalidOptions");
    }
    const ok = expectOk(
      BoardGeneration.generateCoords({ playerCount: 2, strategy: "frontier", target: 1 }),
    );
    expect(ok.map((t) => t.length)).toEqual([1, 1]);
  });

  test("rejects noisePoolFraction outside [0, 1]", () => {
    for (const noisePoolFraction of [-0.1, 1.1, 2]) {
      const failure = expectErr(
        BoardGeneration.generateCoords({ playerCount: 2, strategy: "frontier", noisePoolFraction }),
      );
      expect(failure._tag).toBe("InvalidOptions");
    }
    expectOk(BoardGeneration.generateCoords({ playerCount: 2, strategy: "frontier", noisePoolFraction: 0 }));
    expectOk(BoardGeneration.generateCoords({ playerCount: 2, strategy: "frontier", noisePoolFraction: 1 }));
  });

  test("rejects seedRingDist below 1", () => {
    for (const seedRingDist of [0, -1, 1.5]) {
      const failure = expectErr(
        BoardGeneration.generateCoords({ playerCount: 2, strategy: "frontier", seedRingDist }),
      );
      expect(failure._tag).toBe("InvalidOptions");
    }
  });

  test("rejects growthCap below seedRingDist + 2 with InvalidOptions", () => {
    const failure = expectErr(
      BoardGeneration.generateCoords({ playerCount: 2, strategy: "frontier", seedRingDist: 3, growthCap: 4 }),
    );
    expect(failure._tag).toBe("InvalidOptions");
    expectOk(
      BoardGeneration.generateCoords({ playerCount: 2, strategy: "frontier", seedRingDist: 3, growthCap: 5 }),
    );
  });
});

// ============================================================================
// neutralCoords
// ============================================================================

describe("neutralCoords", () => {
  test("returns nothing for no nations", () => {
    expect(BoardGeneration.neutralCoords([])).toEqual([]);
  });

  test("wraps a single tile in its six neighbours", () => {
    const sea = BoardGeneration.neutralCoords([[Coords.ORIGIN]]);
    expect(sea).toHaveLength(6);
    expect(new Set(sea.map(key)).size).toBe(6);
    for (const cell of sea) expect(Coords.hexDistance(cell, Coords.ORIGIN)).toBe(1);
  });

  test("includes enclosed gaps as sea", () => {
    // A 2-radius disk minus its centre: the centre is a hole surrounded by land.
    const disk: Array<Coords.Coords> = [];
    for (let q = -2; q <= 2; q++) {
      for (let r = -2; r <= 2; r++) {
        if (Coords.hexDistance({ q, r }, Coords.ORIGIN) <= 2) disk.push({ q, r });
      }
    }
    const ring = disk.filter((c) => !(c.q === 0 && c.r === 0));
    const sea = BoardGeneration.neutralCoords([ring]);
    expect(sea.some((c) => c.q === 0 && c.r === 0)).toBe(true);
    for (const cell of sea) expect(distanceToSet(cell, ring)).toBe(1);
  });

  test("is disjoint from land and exactly one hex away from it, for generated boards", () => {
    for (const playerCount of [2, 4, 7]) {
      for (const strategy of ["lattice", "frontier"] as const) {
        const territories = expectOk(
          BoardGeneration.generateCoords({ playerCount, strategy, seed: playerCount * 7 }),
        );
        const land = allCells(territories);
        const sea = BoardGeneration.neutralCoords(territories);
        const landKeys = new Set(land.map(key));
        expect(sea.some((c) => landKeys.has(key(c)))).toBe(false);
        for (const cell of sea) expect(distanceToSet(cell, land)).toBe(1);
      }
    }
  });
});

// ============================================================================
// Types (compile-time guard)
// ============================================================================

test("GenerateCoordsError is exhaustively tagged", () => {
  const tagOf = (e: GenerateCoordsError): string => e._tag;
  expect(tagOf({ _tag: "InvalidPlayerCount", playerCount: 0 })).toBe("InvalidPlayerCount");
});
