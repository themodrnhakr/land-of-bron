import { type Ctx, type Game } from "boardgame.io";
import { Context, Effect, Layer } from "effect";
import { State } from ".";

export class Service extends Context.Service<Service, {
  readonly make: (config: State.Config) => Game<State.State>;
}>()("GameService") {}

export const ServiceDev = Layer.effect(
  Service,
  Effect.gen(function*() {
    const make = (config: State.Config): Game<State.State> => ({
      name: config.name,
      setup: ({ ctx }) => State.State.make({}),
      minPlayers: config.minPlayers,
      maxPlayers: config.maxPlayers,
    });

    return {
      make,
    };
  }),
);
