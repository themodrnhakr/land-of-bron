import { describe, expect, test } from "bun:test";
import { Option } from "effect";
import * as Coords from "./Coords.ts";
import * as Pieces from "./Pieces.ts";

// The Phase 0 net covered generation/catalog/scoring/setup but not the supply
// helpers (D18). These pin the `Option`-based `at` semantics.

describe("makeSupply", () => {
  test("builds a full pool: every piece starts with `at` = None", () => {
    const supply = Pieces.makeSupply(4, { kind: "army" });
    expect(supply).toHaveLength(4);
    for (const piece of supply) {
      expect(Option.isNone(piece.at)).toBe(true);
      expect(piece.kind).toBe("army");
    }
  });

  test("returns a fresh object per element (no shared references)", () => {
    const supply = Pieces.makeSupply(3, { kind: "army" });
    expect(supply[0]).not.toBe(supply[1]);
  });
});

describe("place / returnToPool", () => {
  test("place sets `at` immutably", () => {
    const piece = Pieces.makeSupply(1, { kind: "army" })[0]!;
    const placed = Pieces.place(piece, Coords.ORIGIN);
    expect(Option.isNone(piece.at)).toBe(true); // original untouched
    expect(placed.at).toEqual(Option.some(Coords.ORIGIN));
  });

  test("returnToPool clears `at` immutably", () => {
    const placed = Pieces.place(Pieces.makeSupply(1, { face: "influence" })[0]!, { q: 1, r: 0 });
    const back = Pieces.returnToPool(placed);
    expect(Option.isNone(back.at)).toBe(true);
    expect(back.face).toBe("influence");
    // The original is still on the board.
    expect(Option.isSome(placed.at)).toBe(true);
  });
});

describe("poolCount / onBoardCount", () => {
  test("partition the supply by `at`", () => {
    const supply = Pieces.makeSupply(3, { kind: "army" });
    const placed = [Pieces.place(supply[0]!, Coords.ORIGIN), supply[1]!, supply[2]!];
    expect(Pieces.poolCount(placed)).toBe(2);
    expect(Pieces.onBoardCount(placed)).toBe(1);
    expect(Pieces.poolCount(placed) + Pieces.onBoardCount(placed)).toBe(placed.length);
  });

  test("are zero on an empty supply", () => {
    expect(Pieces.poolCount([])).toBe(0);
    expect(Pieces.onBoardCount([])).toBe(0);
  });
});

describe("PIECE_LIMIT_KEYS", () => {
  test("matches the keys of PIECE_LIMITS exactly", () => {
    expect(new Set<string>(Pieces.PIECE_LIMIT_KEYS)).toEqual(new Set(Object.keys(Pieces.PIECE_LIMITS)));
  });
});

describe("shipCapIssues (D56)", () => {
  test("accepts the defaults", () => {
    expect(Pieces.shipCapIssues(Pieces.PIECE_LIMITS)).toEqual([]);
  });

  test("rejects a per-type cap above the total", () => {
    expect(Pieces.shipCapIssues({ ships: 4, merchantShips: 5, navalShips: 1 }).length).toBeGreaterThan(0);
    expect(Pieces.shipCapIssues({ ships: 4, merchantShips: 1, navalShips: 5 }).length).toBeGreaterThan(0);
  });

  test("rejects per-type caps that cannot cover the total", () => {
    expect(Pieces.shipCapIssues({ ships: 6, merchantShips: 1, navalShips: 1 }).length).toBeGreaterThan(0);
    expect(Pieces.shipCapIssues({ ships: 4, merchantShips: 2, navalShips: 2 })).toEqual([]);
  });
});

describe("edge-located supplies (D55)", () => {
  test("makeEdgeSupply starts every piece pooled and place/returnToPool use edge locations", () => {
    const supply = Pieces.makeEdgeSupply(2, {});
    expect(supply).toHaveLength(2);
    for (const piece of supply) expect(Option.isNone(piece.at)).toBe(true);
    const placed = Pieces.place(supply[0]!, { tile: Coords.ORIGIN, edge: 0 });
    expect(placed.at).toEqual(Option.some({ tile: Coords.ORIGIN, edge: 0 }));
    expect(Option.isNone(supply[0]!.at)).toBe(true);
    expect(Option.isNone(Pieces.returnToPool(placed).at)).toBe(true);
    expect(Pieces.onBoardCount([placed, supply[1]!])).toBe(1);
  });
});
