import { Schema } from "effect";
import { Coords } from ".";

export const tokenSchema = (heads: string, tails: string) =>
  Schema.Struct({
    coords: Schema.optional(Coords.coordsSchema),
    face: Schema.Literals(["heads", "tails"]),
    heads: Schema.Literal(heads),
    tails: Schema.Literal(tails),
  });
