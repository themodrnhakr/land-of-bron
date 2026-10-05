import { Array, Option, Schema } from "effect";
import * as Coords from "./Coords.ts";
import type { Tile } from "./Tile.ts";

// ============================================================================
// Edges (D55)
// ============================================================================
//
// A hex has six edges. An edge is encoded relative to one of its two bordering
// tiles: `{ tile, edge: 0..5 }`, where `edge` indexes `Coords.DIRECTIONS` and
// names the neighbour across that edge. The same physical edge therefore has
// two equivalent encodings; `canonicalEdge` / `edgeKey` collapse a shared edge
// to one value so railroads and ports can be compared and de-duplicated.

/** Six edges per hex. */
export const EDGE_COUNT = 6;

/** An edge index in `0..5`, indexing `Coords.DIRECTIONS`. */
export const edgeIndexSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(EDGE_COUNT - 1),
);
export type EdgeIndex = typeof edgeIndexSchema.Type;

/** An edge, encoded relative to one of its two bordering tiles. */
export const edgeSchema = Schema.Struct({
  tile: Coords.coordsSchema,
  edge: edgeIndexSchema,
});
export type Edge = typeof edgeSchema.Type;

/** A stable key for a hex cell. */
export const coordsKey = (coords: Coords.Coords): string => `${coords.q},${coords.r}`;

/** The neighbour across an edge. */
export const neighborOfEdge = (edge: Edge): Coords.Coords => Coords.add(edge.tile, Coords.DIRECTIONS[edge.edge]!);

/** Both tiles bordering an edge: `[edge.tile, the tile across it]`. */
export const borderingTiles = (edge: Edge): readonly [Coords.Coords, Coords.Coords] => [
  edge.tile,
  neighborOfEdge(edge),
];

/**
 * A canonical key for an edge that is independent of which bordering tile it
 * was encoded from, so a shared edge is one value.
 */
export const edgeKey = (edge: Edge): string => {
  const [a, b] = borderingTiles(edge);
  return [coordsKey(a), coordsKey(b)].sort().join("|");
};

/** Whether two edge encodings name the same physical edge. */
export const sameEdge = (a: Edge, b: Edge): boolean => edgeKey(a) === edgeKey(b);

/** The direction index from `from` to an adjacent `to`, if they are adjacent. */
export const edgeIndexBetween = (from: Coords.Coords, to: Coords.Coords): Option.Option<EdgeIndex> => {
  for (let i = 0; i < EDGE_COUNT; i++) {
    const next = Coords.add(from, Coords.DIRECTIONS[i]!);
    if (next.q === to.q && next.r === to.r) return Option.some(i as EdgeIndex);
  }
  return Option.none();
};

/**
 * Canonicalize the edge between two **adjacent** tiles: `None` when they are not
 * adjacent, otherwise the encoding anchored at the lexicographically smaller
 * tile. This is what makes a shared edge one value.
 */
export const canonicalEdge = (a: Coords.Coords, b: Coords.Coords): Option.Option<Edge> => {
  const [first, second] = coordsKey(a) <= coordsKey(b) ? [a, b] : [b, a];
  return Option.map(edgeIndexBetween(first, second), (edge) => ({ tile: first, edge }));
};

/** The two bordering tiles of an edge, resolved against the board. */
export const borderingBoardTiles = (
  edge: Edge,
  tiles: ReadonlyArray<Tile>,
): readonly [Option.Option<Tile>, Option.Option<Tile>] => {
  const [a, b] = borderingTiles(edge);
  const find = (coords: Coords.Coords): Option.Option<Tile> =>
    Array.findFirst(tiles, (t) => t.coords.q === coords.q && t.coords.r === coords.r);
  return [find(a), find(b)];
};

/**
 * A port sits on the edge between a land tile and a sea tile. `false` when
 * either bordering tile is missing or both are the same kind.
 */
export const isPortEdge = (edge: Edge, tiles: ReadonlyArray<Tile>): boolean => {
  const [a, b] = borderingBoardTiles(edge, tiles);
  if (Option.isNone(a) || Option.isNone(b)) return false;
  const aLand = Option.isSome(a.value.color);
  const bLand = Option.isSome(b.value.color);
  return aLand !== bLand;
};
