import { describe, expect, test } from "bun:test";
import { HashSet, Result } from "effect";
import type { Catalog } from "./Cards.ts";
import * as Cards from "./Cards.ts";
import * as Coords from "./Coords.ts";
import * as Moves from "./Moves.ts";
import * as Nation from "./Nation.ts";
import * as State from "./State.ts";
import * as Tile from "./Tile.ts";

const CATALOG_PIN = { version: "1", hash: "catalog" };
const TERRAIN_PIN = { version: "1", hash: "terrain" };

const state = (): State.State =>
  State.make(
    [
      Tile.fromCoords(Coords.ORIGIN, "red", "plains"),
      Tile.fromCoords({ q: 1, r: 0 }, "red", "forest"),
      Tile.fromCoords({ q: 9, r: 9 }, undefined, "sea"),
    ],
    [Nation.makeNation("red", "Red")],
    CATALOG_PIN,
    TERRAIN_PIN,
  );

const ctx = (over: Partial<Moves.MoveContext> = {}): Moves.MoveContext => ({
  state: state(),
  actor: "red",
  turn: 1,
  phase: "action",
  ...over,
});

// ============================================================================
// Registry shape
// ============================================================================

describe("MOVES registry", () => {
  test("exposes the structural placeholders with their categories and tags", () => {
    expect(Object.keys(Moves.MOVES).sort()).toEqual(["counterAttack", "pass"]);
    expect(Moves.MOVES.pass.categories).toEqual(["action"]);
    expect(Moves.MOVES.pass.tags).toEqual(["action"]);
    expect(Moves.MOVES.counterAttack.categories).toEqual(["react"]);
    expect(Moves.MOVES.counterAttack.respondsTo).toEqual(["action"]);
  });

  test("MOVE_IDS / CHECK_IDS include every registry key and nothing else", () => {
    for (const id of Object.keys(Moves.MOVES)) expect(HashSet.has(Moves.MOVE_IDS, id)).toBe(true);
    for (const id of Object.keys(Moves.CHECKS)) expect(HashSet.has(Moves.CHECK_IDS, id)).toBe(true);
    expect(HashSet.has(Moves.MOVE_IDS, "toString")).toBe(false);
    expect(HashSet.has(Moves.CHECK_IDS, "constructor")).toBe(false);
  });
});

// ============================================================================
// pass
// ============================================================================

describe("pass", () => {
  test("is always legal and leaves the state untouched", () => {
    const c = ctx();
    expect(Moves.MOVES.pass.canApply(c, {})).toEqual(Result.succeed(true));
    const outcome = Moves.MOVES.pass.apply(c, {});
    expect(Result.isSuccess(outcome)).toBe(true);
    if (Result.isSuccess(outcome)) expect(outcome.success.state).toBe(c.state);
  });
});

// ============================================================================
// counterAttack (placeholder with structural legality)
// ============================================================================

describe("counterAttack", () => {
  test("is legal when the target cell exists on the board", () => {
    expect(Moves.MOVES.counterAttack.canApply(ctx(), { at: Coords.ORIGIN })).toEqual(Result.succeed(true));
    expect(Moves.MOVES.counterAttack.canApply(ctx(), { at: { q: 1, r: 0 } })).toEqual(Result.succeed(true));
  });

  test("is illegal when the target cell is off the board", () => {
    const result = Moves.MOVES.counterAttack.canApply(ctx(), { at: { q: 5, r: 5 } });
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) expect(result.success).toBe(false);
  });

  test("leaves the state untouched for now (the real rule is user-provided)", () => {
    const c = ctx();
    const outcome = Moves.MOVES.counterAttack.apply(c, { at: Coords.ORIGIN });
    expect(Result.isSuccess(outcome)).toBe(true);
    if (Result.isSuccess(outcome)) expect(outcome.success.state).toBe(c.state);
  });
});

// ============================================================================
// config-references-code path
// ============================================================================

const catalog = (actions: ReadonlyArray<{ move: string; params?: Record<string, unknown> }>): Catalog => ({
  version: "1",
  domains: [{ id: "military", subtypes: [{ id: "conquest" }] }],
  categoryDomains: { action: ["military"] },
  chits: [],
  cards: [{
    id: "c1",
    name: "Card 1",
    domains: ["military"],
    body: "",
    age: 1,
    minimumPlayers: 1,
    kind: "regular",
    actions: actions.map((a) => ({ move: a.move, optional: false, params: a.params ?? {} })),
  }],
});

describe("a test catalog references real moves end to end", () => {
  test("binds pass and a well-parameterised counterAttack, and lints", () => {
    const result = Cards.lintCatalog(
      catalog([
        { move: "pass" },
        { move: "counterAttack", params: { at: { q: 0, r: 0 } } },
      ]),
    );
    expect(Result.isSuccess(result)).toBe(true);
  });

  test("reports a counterAttack binding with missing params", () => {
    const result = Cards.lintCatalog(catalog([{ move: "counterAttack" }]));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure.map((i) => i.message).join(" ")).toContain("counterAttack");
    }
  });
});
