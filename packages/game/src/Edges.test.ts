import { describe, expect, test } from "bun:test";
import { Option } from "effect";
import * as Coords from "./Coords.ts";
import * as Edges from "./Edges.ts";
import * as Tile from "./Tile.ts";

describe("borderingTiles (D55)", () => {
  test("returns the anchor tile and the neighbour across the edge", () => {
    expect(Edges.borderingTiles({ tile: Coords.ORIGIN, edge: 0 })).toEqual([
      Coords.ORIGIN,
      { q: 1, r: 0 },
    ]);
  });

  test("every edge index names a distinct neighbour", () => {
    const neighbours = Array.from(
      { length: 6 },
      (_, i) => Edges.neighborOfEdge({ tile: Coords.ORIGIN, edge: i as Edges.EdgeIndex }),
    );
    expect(new Set(neighbours.map(Edges.coordsKey)).size).toBe(6);
  });
});

describe("canonicalEdge / edgeKey (D55)", () => {
  test("a shared edge canonicalises to one value regardless of direction", () => {
    const a = Coords.ORIGIN;
    const b = { q: 1, r: 0 };
    const ab = Edges.canonicalEdge(a, b);
    const ba = Edges.canonicalEdge(b, a);
    expect(Option.isSome(ab)).toBe(true);
    expect(Option.isSome(ba)).toBe(true);
    if (Option.isSome(ab) && Option.isSome(ba)) {
      expect(Edges.edgeKey(ab.value)).toBe(Edges.edgeKey(ba.value));
      expect(Edges.sameEdge(ab.value, ba.value)).toBe(true);
    }
  });

  test("returns None for the same tile or for non-adjacent tiles", () => {
    expect(Option.isNone(Edges.canonicalEdge(Coords.ORIGIN, Coords.ORIGIN))).toBe(true);
    expect(Option.isNone(Edges.canonicalEdge(Coords.ORIGIN, { q: 5, r: 5 }))).toBe(true);
  });

  test("the six edges of a hex have six distinct keys", () => {
    const keys = new Set(
      Array.from({ length: 6 }, (_, i) => Edges.edgeKey({ tile: Coords.ORIGIN, edge: i as Edges.EdgeIndex })),
    );
    expect(keys.size).toBe(6);
  });
});

describe("isPortEdge (D55)", () => {
  const land = Tile.fromCoords({ q: 0, r: 0 }, "red", "plains");
  const sea = Tile.fromCoords({ q: 1, r: 0 }, undefined, "sea");

  test("true on a land<->sea edge, from either side", () => {
    expect(Edges.isPortEdge({ tile: { q: 0, r: 0 }, edge: 0 }, [land, sea])).toBe(true);
    expect(Edges.isPortEdge({ tile: { q: 1, r: 0 }, edge: 3 }, [land, sea])).toBe(true);
  });

  test("false on land<->land or sea<->sea", () => {
    const land2 = Tile.fromCoords({ q: 1, r: 0 }, "blue", "forest");
    expect(Edges.isPortEdge({ tile: { q: 0, r: 0 }, edge: 0 }, [land, land2])).toBe(false);
    const sea2 = Tile.fromCoords({ q: 1, r: 0 }, undefined, "sea");
    expect(Edges.isPortEdge({ tile: { q: 0, r: 0 }, edge: 0 }, [sea, sea2])).toBe(false);
  });

  test("false when a bordering tile is missing from the board", () => {
    expect(Edges.isPortEdge({ tile: { q: 0, r: 0 }, edge: 0 }, [land])).toBe(false);
  });
});
