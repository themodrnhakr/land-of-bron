import { Schema } from "effect";

/** Axial hex coordinates `{ q, r }`. */
export const coordsSchema = Schema.Struct({
  q: Schema.Number,
  r: Schema.Number,
});
export type Coords = typeof coordsSchema.Type;

/** Cube coordinates `{ q, r, s }` with the invariant `q + r + s === 0`. */
export const cubeSchema = Schema.Struct({
  ...coordsSchema.fields,
  s: Schema.Number,
});
export type Cube = typeof cubeSchema.Type;

/**
 * Convert axial coordinates to cube coordinates (`s = -q - r`).
 */
export const toCube = (coords: Coords): Cube => ({
  ...coords,
  s: -coords.q - coords.r,
});

/** Convert cube coordinates back to axial coordinates. */
export const fromCube = (cube: Cube): Coords => ({
  q: cube.q,
  r: cube.r,
});

// --- hex math primitives (shared by the generation strategies) ---

/** The origin cell `{ q: 0, r: 0 }`. */
export const ORIGIN: Coords = { q: 0, r: 0 };

/** The six axial directions a hex can step in. */
export const DIRECTIONS: readonly Coords[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

/**
 * Distance between two cells: half of their cube-space Manhattan distance.
 */
export const hexDistance = (a: Coords, b: Coords): number =>
  (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

/**
 * Translate a cell by an offset (pure vector addition in axial coordinates).
 */
export const add = (a: Coords, b: Coords): Coords => ({
  q: a.q + b.q,
  r: a.r + b.r,
});
