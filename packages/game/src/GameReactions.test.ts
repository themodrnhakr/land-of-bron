import { INVALID_MOVE } from "boardgame.io/core";
import { describe, expect, test } from "bun:test";
import { Option, Result, Schema } from "effect";
import type { Catalog } from "./Cards.ts";
import * as Coords from "./Coords.ts";
import * as GameModule from "./Game.ts";
import type { MoveDefinition } from "./Moves.ts";
import * as Nation from "./Nation.ts";
import type { Color } from "./Nation.ts";
import * as State from "./State.ts";
import * as Tile from "./Tile.ts";

// ============================================================================
// Fixture: a catalog + move registry that exercises the bridge's windows
// ============================================================================

const CATALOG_PIN = { version: "1", hash: "c" };
const TERRAIN_PIN = { version: "1", hash: "t" };

const withScore = (state: State.State, color: Color, delta: number): State.State =>
  new State.State({
    ...state,
    nations: state.nations.map((n) => (n.color === color ? { ...n, score: n.score + delta } : n)),
  });

const registry: Record<string, MoveDefinition<any>> = {
  strike: {
    categories: ["action"],
    tags: ["action"],
    params: Schema.Struct({ target: Schema.optional(Schema.Literals(["red", "orange", "blue"])) }),
    canApply: () => Result.succeed(true),
    apply: (ctx) => Result.succeed({ state: withScore(ctx.state, ctx.actor, 1) }),
  },
  block: {
    categories: ["react"],
    respondsTo: ["action"],
    params: Schema.Struct({}),
    canApply: () => Result.succeed(true),
    apply: (ctx) => Result.succeed({ state: ctx.state, veto: true }),
  },
  gain: {
    categories: ["trigger"],
    respondsTo: ["action"],
    params: Schema.Struct({ amount: Schema.Number }),
    canApply: () => Result.succeed(true),
    apply: (ctx, p) => Result.succeed({ state: withScore(ctx.state, ctx.actor, p.amount) }),
  },
};

const card = (id: string, move: string, params: Record<string, unknown> = {}) => ({
  id,
  name: id,
  domains: ["d"],
  body: "",
  age: 1,
  minimumPlayers: 1,
  kind: "regular" as const,
  actions: [{ move, optional: false, params }],
});

const catalog: Catalog = {
  version: "1",
  domains: [{ id: "d", subtypes: [{ id: "s" }] }],
  categoryDomains: {},
  chits: [],
  cards: [card("c-block", "block"), card("c-gain", "gain", { amount: 5 })],
};

const moveMap = GameModule.buildMoves(registry, catalog);

const seededState = (): State.State => {
  const red = Nation.makeNation("red", "Red");
  const orange = Nation.makeNation("orange", "Orange");
  const blue = Nation.makeNation("blue", "Blue");
  return State.make(
    [Tile.fromCoords(Coords.ORIGIN, "red", "plains"), Tile.fromCoords({ q: 1, r: 0 }, "orange", "forest")],
    [
      { ...red, hand: ["c-block"] },
      { ...orange, hand: ["c-gain"] },
      blue,
    ],
    CATALOG_PIN,
    TERRAIN_PIN,
  );
};

const ctx = {
  turn: 1,
  phase: "action",
  numPlayers: 3,
  currentPlayer: "0",
  playOrder: ["0", "1", "2"],
  playOrderPos: 0,
  activePlayers: null,
} as never;

/** Invoke a bridged move directly (bypassing boardgame.io's turn guard). */
const invoke = (
  name: string,
  G: State.StateEncoded,
  playerID: string,
  arg?: unknown,
): State.State | typeof INVALID_MOVE => {
  const entry = moveMap[name];
  if (entry === undefined) throw new Error(`no move "${name}"`);
  const fn = typeof entry === "function" ? entry : entry.move;
  const result = fn(
    { G, ctx, playerID, events: {}, random: {}, log: {} } as never,
    ...(arg === undefined ? [] : [arg]),
  );
  return result === undefined ? INVALID_MOVE : (result as State.State | typeof INVALID_MOVE);
};

const run = (name: string, state: State.State, playerID: string, arg?: unknown): State.State => {
  const result = invoke(name, State.encode(state), playerID, arg);
  if (result === INVALID_MOVE) throw new Error(`move "${name}" was rejected`);
  return State.decodeUnknown(result);
};

// ============================================================================
// Tests
// ============================================================================

describe("bridge reaction integration (D13)", () => {
  test("a move with an eligible interruptor suspends without applying", () => {
    const next = run("strike", seededState(), "0", { target: "red" });
    expect(next.events).toEqual([]); // event not logged yet
    expect(next.nations.find((n) => n.color === "red")!.score).toBe(0); // effect not applied
    expect(Option.isSome(next.pendingReactions)).toBe(true);
    if (Option.isSome(next.pendingReactions)) {
      expect(next.pendingReactions.value.phase).toBe("interrupt");
      expect(next.pendingReactions.value.eligible).toEqual(["red"]);
    }
  });

  test("veto path: the event is discarded and never logged", () => {
    let s = run("strike", seededState(), "0", { target: "red" });
    s = run("declareReaction", s, "0", { move: "block", params: {} });
    expect(Option.isNone(s.pendingReactions)).toBe(true);
    expect(s.events).toEqual([]);
    expect(s.nations.find((n) => n.color === "red")!.score).toBe(0);
  });

  test("happy path: event applies, then the trigger window resolves", () => {
    let s = run("strike", seededState(), "0", { target: "red" });
    // Red (the only interruptor) passes.
    s = run("passReaction", s, "0");
    expect(s.events).toHaveLength(1);
    expect(s.events[0]!.move).toBe("strike");
    expect(s.nations.find((n) => n.color === "red")!.score).toBe(1);
    // The trigger window is now open for orange.
    expect(Option.isSome(s.pendingReactions)).toBe(true);
    if (Option.isSome(s.pendingReactions)) {
      expect(s.pendingReactions.value.phase).toBe("trigger");
      expect(s.pendingReactions.value.eligible).toEqual(["orange"]);
    }
    s = run("declareReaction", s, "1", { move: "gain", params: { amount: 5 } });
    expect(Option.isNone(s.pendingReactions)).toBe(true);
    expect(s.nations.find((n) => n.color === "orange")!.score).toBe(5);
    // Terminal: the trigger produced no further event.
    expect(s.events).toHaveLength(1);
  });

  test("an ineligible player cannot declare or pass", () => {
    const s = run("strike", seededState(), "0", { target: "red" });
    // Blue holds no reaction card.
    expect(invoke("passReaction", State.encode(s), "2")).toBe(INVALID_MOVE);
    expect(invoke("declareReaction", State.encode(s), "2", { move: "block", params: {} })).toBe(INVALID_MOVE);
  });
});
