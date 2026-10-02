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
