import { Schema } from "effect";
import { Coords } from ".";

export const colorSchema = Schema.Literals(["red", "orange", "yellow", "green", "blue", "indigo", "violet"]);
export type Color = typeof colorSchema.Type;

export const tokenSchema = (heads: string, tails: string) =>
  Schema.Struct({
    coords: Schema.optional(Coords.coordsSchema),
    face: Schema.Literals(["heads", "tails"]),
    heads: Schema.Literal(heads),
    tails: Schema.Literal(tails),
  });

export const nationSchema = Schema.Struct({
  color: colorSchema,
  name: Schema.String,
  tokens: Schema.Struct({
    influence: tokenSchema("influence", "goodwill"),
    religion: tokenSchema("prosletized", "converted"),
  }),
});

export const terrainNameSchema = Schema.String;
export const terrainSchema = Schema.Struct({
  name: terrainNameSchema,
  resistance: Schema.String,
  population: Schema.String,
  count: Schema.Number,
});

export const tileSchema = Schema.Struct({
  color: colorSchema,
  terrain: terrainNameSchema,
  control: Schema.optional(colorSchema),
  coords: Coords.coordsSchema,
});
