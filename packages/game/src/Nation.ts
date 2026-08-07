import { Schema } from "effect";
import { Parts } from ".";

export const colorSchema = Schema.Literals(["red", "orange", "yellow", "green", "blue", "indigo", "violet"]);
export type Color = typeof colorSchema.Type;

export const nationSchema = Schema.Struct({
  color: colorSchema,
  name: Schema.String,
  tokens: Schema.Struct({
    influence: Parts.tokenSchema("influence", "goodwill"),
    religion: Parts.tokenSchema("prosletized", "converted"),
  }),
});
export type Nation = typeof nationSchema;
