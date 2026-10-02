import type { Game } from "boardgame.io";
import { Client } from "boardgame.io/client";
import { describe, expect, test } from "bun:test";
import { Option } from "effect";
import * as GameModule from "./Game.ts";
import * as State from "./State.ts";
import * as View from "./View.ts";

type EncodedState = State.StateEncoded;

const build = (): Game<EncodedState, {}, unknown> =>
  GameModule.makeDevGame(
    new State.Config({ name: "LandOfBronTest", minPlayers: 2, maxPlayers: 2 }),
  ) as unknown as Game<EncodedState, {}, unknown>;

const makeClient = () => {
  const game = build();
  const client = Client<EncodedState, {}>({ game, numPlayers: 2 });
  return { game, client };
};

/** `moves` is an index signature, so assert the dispatcher exists. */
const move = (client: ReturnType<typeof Client<EncodedState, {}>>, name: string, ...args: Array<unknown>): void => {
  const dispatcher = client.moves[name];
  if (dispatcher === undefined) throw new Error(`no such move: ${name}`);
  dispatcher(...args);
};

describe("Game assembly (Phase 3)", () => {
  test("builds a playable Game with the expected top-level shape", () => {
    const game = build();
    expect(game.name).toBe("LandOfBronTest");
    expect(Object.keys(game.moves ?? {}).sort()).toEqual(["counterAttack", "pass"]);
    expect(game.turn?.maxMoves).toBe(1);
    expect(game.phases?.["action"]?.start).toBe(true);
    expect(typeof game.playerView).toBe("function");
    expect(typeof game.endIf).toBe("function");
  });

  test("setups a full initial state through the framework", () => {
    const { client } = makeClient();
    const state = client.getState();
    expect(state).not.toBeNull();
    if (state === null) return;
    expect(state.G.nations.map((n) => n.color)).toEqual(["red", "orange"]);
    expect(state.G.tiles.length).toBeGreaterThan(0);
    expect(state.G.events).toEqual([]);
    expect(state.ctx.numPlayers).toBe(2);
  });

  test("makes a move and logs exactly one replayable GameEvent", () => {
    const { client } = makeClient();
    move(client, "pass");
    const state = client.getState();
    expect(state).not.toBeNull();
    if (state === null) return;
    expect(state.G.events).toHaveLength(1);
    const event = state.G.events[0]!;
    expect(event.move).toBe("pass");
    expect(event.categories).toEqual(["action"]);
    expect(event.tags).toEqual(["action"]);
    expect(event.actor).toBe("red");
    expect(event.seq).toBe(0);
    // The turn advanced (maxMoves 1).
    expect(state.ctx.currentPlayer).toBe("1");
    expect(state.ctx.turn).toBe(2);
  });

  test("seq is monotonic across turns", () => {
    const { client } = makeClient();
    move(client, "pass");
    move(client, "pass");
    const state = client.getState();
    expect(state?.G.events.map((e) => e.seq)).toEqual([0, 1]);
    expect(state?.G.events.map((e) => e.actor)).toEqual(["red", "orange"]);
  });

  test("rejects an illegal move (missing required params) without changing state", () => {
    const { client } = makeClient();
    move(client, "counterAttack"); // requires { at: Coords }
    const state = client.getState();
    expect(state?.G.events).toEqual([]);
  });

  test("accepts a move whose params decode and logs the `at` location", () => {
    const { client } = makeClient();
    const at = client.getState()!.G.tiles[0]!.coords;
    move(client, "counterAttack", { at });
    const state = client.getState();
    expect(state?.G.events).toHaveLength(1);
    expect(state?.G.events[0]!.at).toEqual(at);
  });

  test("rejects a move whose target is not a board cell", () => {
    const { client } = makeClient();
    move(client, "counterAttack", { at: { q: 9999, r: 9999 } });
    expect(client.getState()?.G.events).toEqual([]);
  });

  test("endIf does not end the game (deferred trigger, D39)", () => {
    const { client } = makeClient();
    move(client, "pass");
    move(client, "pass");
    expect(client.getState()?.ctx.gameover).toBeUndefined();
  });

  test("G is plain JSON: no Option class instances, JSON round-trips (open question 7)", () => {
    const { client } = makeClient();
    move(client, "pass");
    const state = client.getState();
    expect(state).not.toBeNull();
    if (state === null) return;
    // boardgame.io's serializability plugin would have thrown on any class
    // instance; assert the wire form is plain and losslessly JSON round-trips.
    const json = JSON.parse(JSON.stringify(state.G));
    expect(json).toEqual(state.G);
    expect(JSON.stringify(state.G)).not.toContain("_tag\":\"Some");
    // Decoding the wire form restores the engine's Option fields.
    const typed = State.decodeUnknown(state.G);
    for (const nation of typed.nations) {
      for (const piece of nation.influence) expect(Option.isNone(piece.at)).toBe(true);
    }
    expect(Option.isNone(typed.tiles[0]!.control)).toBe(true);
    expect(Option.isNone(typed.events[0]!.at)).toBe(true);
  });
});

describe("playerView redaction (D11)", () => {
  const seeded = () => {
    const { client } = makeClient();
    const state = client.getState();
    if (state === null) throw new Error("no state");
    const G: EncodedState = {
      ...state.G,
      nations: state.G.nations.map((n, i) => ({
        ...n,
        hand: [`h${i}`],
        deck: [`d${i}`],
        mandates: [`m${i}`],
        mat: { ...n.mat, cards: [`c${i}`] },
      })),
    };
    return { ctx: state.ctx, G };
  };

  test("the owner sees their own private zones and opponents' are emptied", () => {
    const game = build();
    const { ctx, G } = seeded();
    const view = game.playerView!({ G, ctx, playerID: "0" }) as EncodedState;
    expect(view.nations[0]!.hand).toEqual(["h0"]);
    expect(view.nations[0]!.mandates).toEqual(["m0"]);
    expect(view.nations[0]!.mat.cards).toEqual(["c0"]);
    // Opponent redacted.
    expect(view.nations[1]!.hand).toEqual([]);
    expect(view.nations[1]!.deck).toEqual([]);
    expect(view.nations[1]!.mandates).toEqual([]);
    expect(view.nations[1]!.mat.cards).toEqual([]);
    // Public zones untouched.
    expect(view.nations[1]!.discard).toEqual(G.nations[1]!.discard);
    expect(view.nations[1]!.score).toBe(G.nations[1]!.score);
  });

  test("a spectator sees no private zones (typed redaction helper)", () => {
    const { G } = seeded();
    const view = View.redactForViewer(State.decodeUnknown(G), null);
    for (const nation of view.nations) {
      expect(nation.hand).toEqual([]);
      expect(nation.deck).toEqual([]);
      expect(nation.mandates).toEqual([]);
      expect(nation.mat.cards).toEqual([]);
    }
  });

  test("redaction does not mutate the original state", () => {
    const { G } = seeded();
    const before = JSON.stringify(G);
    View.redactForViewer(State.decodeUnknown(G), null);
    expect(JSON.stringify(G)).toBe(before);
  });
});
