import { Schema } from "effect";

export const coordsSchema = Schema.Struct({
  q: Schema.Number,
  r: Schema.Number,
});
export type Coords = typeof coordsSchema.Type;

export const cubeSchema = Schema.Struct({
  ...coordsSchema.fields,
  s: Schema.Number,
});
export type Cube = typeof cubeSchema.Type;

export const toCube = (coords: Coords): Cube => ({
  ...coords,
  s: -coords.q - coords.r,
});

export const fromCube = (cube: Cube): Coords => ({
  q: cube.q,
  r: cube.r,
});
