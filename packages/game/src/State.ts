import { Data, Schema } from "effect";

export class Config extends Schema.TaggedClass<Config>()("State/Config", {
  name: Schema.String,
  minPlayers: Schema.Number,
  maxPlayers: Schema.Number,
}) {}

export class State extends Schema.TaggedClass<State>()("State", {}) {}
