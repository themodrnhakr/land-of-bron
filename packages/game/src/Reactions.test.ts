import { describe, expect, test } from "bun:test";
import { Option, Result, Schema } from "effect";
import type { Catalog } from "./Cards.ts";
import * as Coords from "./Coords.ts";
import type { MoveDefinition } from "./Moves.ts";
import * as Nation from "./Nation.ts";
import type { Color, Nation as NationT } from "./Nation.ts";
import * as Reactions from "./Reactions.ts";
import * as State from "./State.ts";
import type { GameEvent } from "./State.ts";
import * as Tile from "./Tile.ts";

// ============================================================================
// Fixtures: a minimal catalog of reaction cards + fixture move registry
// ============================================================================

const CATALOG_PIN = { version: "1", hash: "c" };
const TERRAIN_PIN = { version: "1", hash: "t" };

const withScore = (state: State.State, color: Color, delta: number): State.State =>
  new State.State({
    ...state,
    nations: state.nations.map((n) => (n.color === color ? { ...n, score: n.score + delta } : n)),
  });

const moves: Reactions.MovesRegistry = {
  action: {
    categories: ["action"],
    tags: ["action"],
    params: Schema.Struct({}),
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
  modify: {
    categories: ["react"],
    respondsTo: ["action"],
    params: Schema.Struct({ target: Schema.Literals(["red", "orange", "blue"]) }),
    canApply: () => Result.succeed(true),
    apply: (ctx, p) => {
      const pending = ctx.pendingEvent;
      return Result.succeed({
        state: ctx.state,
        event: pending === undefined ? undefined : { ...pending, target: Option.some(p.target) },
      });
    },
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
  cards: [
    card("c-block", "block"),
    card("c-modify", "modify", { target: "blue" }),
    card("c-gain", "gain", { amount: 5 }),
  ],
};

/** Three nations, each holding one reaction card. */
const state = (): State.State => {
  const red = Nation.makeNation("red", "Red");
  const orange = Nation.makeNation("orange", "Orange");
  const blue = Nation.makeNation("blue", "Blue");
  const withHand = (n: NationT, hand: string[]): NationT => ({ ...n, hand });
  return State.make(
    [Tile.fromCoords(Coords.ORIGIN, "red", "plains"), Tile.fromCoords({ q: 1, r: 0 }, "orange", "forest")],
    [
      withHand(red, ["c-block"]),
      withHand(orange, ["c-gain"]),
      withHand(blue, ["c-modify"]),
    ],
    CATALOG_PIN,
    TERRAIN_PIN,
  );
};

const event = (over: Partial<GameEvent> = {}): GameEvent => ({
  seq: 0,
  move: "action",
  categories: ["action"],
  tags: ["action"],
  actor: "red",
  at: Option.none(),
  target: Option.none(),
  params: {},
  turn: 1,
  ...over,
});

const window = (over: Partial<State.PendingReactions> = {}): State.PendingReactions => ({
  event: event(),
  phase: "interrupt",
  eligible: ["red", "orange", "blue"],
  declarations: [],
  passed: [],
  ...over,
});

// ============================================================================
// Eligibility
// ============================================================================

describe("reaction eligibility", () => {
  test("a nation can react only when it holds a binding whose move responds to the tags", () => {
    const s = state();
    expect(Reactions.canReact(s.nations[0]!, catalog, event(), "interrupt", moves)).toBe(true); // red holds block
    const noCards = new State.State({
      ...s,
      nations: s.nations.map((n) => ({ ...n, hand: [] })),
    });
    expect(Reactions.canReact(noCards.nations[0]!, catalog, event(), "interrupt", moves)).toBe(false);
  });

  test("orders the target first, then the rest in seat order", () => {
    const s = state();
    expect(Reactions.eligibleReactors(s, catalog, event({ target: Option.some("blue") }), "interrupt", moves)).toEqual([
      "blue",
      "red",
    ]);
    expect(Reactions.eligibleReactors(s, catalog, event(), "interrupt", moves)).toEqual(["red", "blue"]);
    expect(Reactions.eligibleReactors(s, catalog, event(), "trigger", moves)).toEqual(["orange"]);
  });

  test("reads reaction powers from mat chits too", () => {
    const s = state();
    const chitCatalog: Catalog = {
      ...catalog,
      chits: [{
        id: "k-block",
        domain: "d",
        subtype: "s",
        description: "",
        powers: [{ move: "block", optional: false, params: {} }],
      }],
      cards: [],
    };
    const withChit = new State.State({
      ...s,
      nations: s.nations.map((n, i) => ({
        ...n,
        hand: [],
        mat: { ...n.mat, slots: i === 0 ? [{ domain: "d", chit: Option.some("k-block") }] : [] },
      })),
    });
    expect(Reactions.canReact(withChit.nations[0]!, chitCatalog, event(), "interrupt", moves)).toBe(true);
  });

  test("openWindow is None when nobody can react", () => {
    const s = state();
    const empty: Catalog = { ...catalog, cards: [], chits: [] };
    expect(Option.isNone(Reactions.openWindow(s, empty, event(), "interrupt", moves))).toBe(true);
    expect(Option.isSome(Reactions.openWindow(s, catalog, event(), "interrupt", moves))).toBe(true);
  });
});

// ============================================================================
// Declaration queue
// ============================================================================

describe("declaration queue", () => {
  test("records a public declaration and clears a prior pass", () => {
    const passed: State.PendingReactions = { ...window(), passed: ["red"] };
    const result = Reactions.declare(passed, "red", "block", {}, 1, moves);
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success.declarations).toEqual([{ seq: 1, actor: "red", move: "block", params: {} }]);
      expect(result.success.passed).toEqual([]);
    }
  });

  test("rejects an ineligible actor, a duplicate declaration, and an unknown move", () => {
    expect(Result.isFailure(Reactions.declare(window({ eligible: ["orange"] }), "red", "block", {}, 1, moves))).toBe(
      true,
    );
    expect(
      Result.isFailure(
        Reactions.declare(
          window({ declarations: [{ seq: 0, actor: "red", move: "block", params: {} }] }),
          "red",
          "block",
          {},
          1,
          moves,
        ),
      ),
    ).toBe(true);
    expect(Result.isFailure(Reactions.declare(window(), "red", "nope", {}, 1, moves))).toBe(true);
  });

  test("pass is a no-op after declaring and is idempotent", () => {
    const declared = window({ declarations: [{ seq: 0, actor: "red", move: "block", params: {} }] });
    expect(Result.isSuccess(Reactions.pass(declared, "red"))).toBe(true);
    const once = Reactions.pass(window(), "red");
    expect(Result.isSuccess(once)).toBe(true);
    if (Result.isSuccess(once)) {
      expect(Result.isFailure(Reactions.pass(once.success, "red"))).toBe(true);
    }
  });

  test("isComplete once every eligible player has declared or passed", () => {
    let w = window();
    expect(Reactions.isComplete(w)).toBe(false);
    for (const [i, actor] of w.eligible.entries()) {
      const result = Reactions.pass(w, actor);
      if (Result.isSuccess(result)) w = result.success;
      expect(Reactions.isComplete(w)).toBe(i === w.eligible.length - 1);
    }
  });

  test("orderedDeclarations sorts by seq (declaration order)", () => {
    const w = window({
      declarations: [
        { seq: 5, actor: "blue", move: "modify", params: { tag: "late" } },
        { seq: 2, actor: "red", move: "block", params: {} },
      ],
    });
    expect(Reactions.orderedDeclarations(w).map((d) => d.actor)).toEqual(["red", "blue"]);
  });
});

// ============================================================================
// Resolution
// ============================================================================

describe("interrupt resolution", () => {
  test("a veto stops the event", () => {
    const w = window({ declarations: [{ seq: 0, actor: "red", move: "block", params: {} }] });
    const resolved = Reactions.resolveInterrupt(state(), w, moves);
    expect(resolved.vetoed).toBe(true);
    expect(resolved.event).toEqual(w.event);
  });

  test("a modification replaces the in-flight event", () => {
    const w = window({ declarations: [{ seq: 0, actor: "blue", move: "modify", params: { target: "blue" } }] });
    const resolved = Reactions.resolveInterrupt(state(), w, moves);
    expect(resolved.vetoed).toBe(false);
    expect(resolved.event.target).toEqual(Option.some("blue"));
  });

  test("an illegal declaration is skipped without aborting the fold", () => {
    const w = window({
      declarations: [
        { seq: 0, actor: "blue", move: "modify", params: { target: "blue" } },
        { seq: 1, actor: "red", move: "block", params: {} },
      ],
    });
    const resolved = Reactions.resolveInterrupt(state(), w, moves);
    expect(resolved.vetoed).toBe(true);
    expect(resolved.event.target).toEqual(Option.some("blue"));
  });
});

describe("trigger resolution", () => {
  test("fires declarations after the event, and is terminal", () => {
    const w = window({
      phase: "trigger",
      declarations: [{ seq: 0, actor: "orange", move: "gain", params: { amount: 5 } }],
    });
    const before = state();
    const after = Reactions.resolveTrigger(before, w, moves);
    expect(after.nations.find((n) => n.color === "orange")!.score).toBe(5);
    // Terminal: the reaction produced no new event and opened no window.
    expect(after.events).toEqual([]);
    expect(Option.isNone(after.pendingReactions)).toBe(true);
  });
});

describe("applyEvent + logEvent", () => {
  test("applyEvent runs the originating move's effect", () => {
    const after = Reactions.applyEvent(state(), event(), moves);
    expect(after.nations.find((n) => n.color === "red")!.score).toBe(1);
  });

  test("logEvent appends to the replayable log", () => {
    const after = Reactions.logEvent(state(), event({ seq: 7 }));
    expect(after.events.map((e) => e.seq)).toEqual([7]);
  });
});

// ============================================================================
// End-to-end pipeline
// ============================================================================

describe("full pipeline", () => {
  test("veto path: the event does not apply and no trigger fires", () => {
    let s = state();
    const e = event();
    const opened = Reactions.openWindow(s, catalog, e, "interrupt", moves);
    expect(Option.isSome(opened)).toBe(true);
    if (Option.isNone(opened)) return;
    let w = opened.value;
    const declared = Reactions.declare(w, "red", "block", {}, 1, moves);
    if (Result.isSuccess(declared)) w = declared.success;
    for (const actor of ["orange", "blue"] as const) {
      const passed = Reactions.pass(w, actor);
      if (Result.isSuccess(passed)) w = passed.success;
    }
    expect(Reactions.isComplete(w)).toBe(true);
    const interrupt = Reactions.resolveInterrupt(s, w, moves);
    expect(interrupt.vetoed).toBe(true);
    s = interrupt.state;
    expect(s.nations.find((n) => n.color === "red")!.score).toBe(0); // event never applied
    expect(s.events).toEqual([]);
  });

  test("happy path: event applies, then the trigger window fires", () => {
    let s = state();
    const e = event();
    const interruptWindow = Reactions.openWindow(s, catalog, e, "interrupt", moves);
    expect(Option.isSome(interruptWindow)).toBe(true);
    if (Option.isNone(interruptWindow)) return;
    let w = interruptWindow.value;
    for (const actor of w.eligible) {
      const passed = Reactions.pass(w, actor);
      if (Result.isSuccess(passed)) w = passed.success;
    }
    const interrupt = Reactions.resolveInterrupt(s, w, moves);
    expect(interrupt.vetoed).toBe(false);
    s = Reactions.applyEvent(interrupt.state, interrupt.event, moves);
    s = Reactions.logEvent(s, interrupt.event);
    expect(s.nations.find((n) => n.color === "red")!.score).toBe(1);

    const triggerWindow = Reactions.openWindow(s, catalog, interrupt.event, "trigger", moves);
    expect(Option.isSome(triggerWindow)).toBe(true);
    if (Option.isSome(triggerWindow)) {
      let tw = triggerWindow.value;
      const declared = Reactions.declare(tw, "orange", "gain", { amount: 5 }, 2, moves);
      if (Result.isSuccess(declared)) tw = declared.success;
      for (const actor of ["red", "blue"] as const) {
        const passed = Reactions.pass(tw, actor);
        if (Result.isSuccess(passed)) tw = passed.success;
      }
      s = Reactions.resolveTrigger(s, tw, moves);
    }
    expect(s.nations.find((n) => n.color === "orange")!.score).toBe(5);
  });
});
