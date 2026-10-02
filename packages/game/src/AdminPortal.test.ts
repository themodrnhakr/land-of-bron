import { describe, expect, test } from "bun:test";
import { Effect, HashMap, Option } from "effect";
import * as Cards from "./Cards.ts";
import * as Moves from "./Moves.ts";

// Phase 6 groundwork: the admin portal reads the same schemas the engine does.
// These tests pin the two portal-facing lookups: loading a catalog at startup
// through `CardCatalogFromJson`, and the tag index that powers the `respondsTo`
// picker.

describe("CardCatalogFromJson (startup decode + lint)", () => {
  const json = JSON.stringify({
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
      actions: [{ move: "pass" }],
    }],
  });

  const program = Effect.gen(function*() {
    const catalog = yield* Cards.CardCatalog;
    return catalog;
  });

  test("loads a valid catalog and exposes indexed lookups", () => {
    const service = Effect.runSync(Effect.provide(program, Cards.CardCatalogFromJson(json)));
    expect(service.version).toBe("1");
    expect(service.hash.length).toBeGreaterThan(0);
    expect(Option.isSome(service.card("c1"))).toBe(true);
    expect(HashMap.size(service.index.cardsById)).toBe(1);
    expect(Option.isNone(service.card("nope"))).toBe(true);
  });

  test("fails at layer construction for a catalog that does not lint", () => {
    const bad = JSON.stringify({
      version: "1",
      domains: [],
      categoryDomains: {},
      chits: [],
      cards: [{
        id: "c1",
        name: "Card 1",
        domains: ["missing"],
        body: "",
        age: 1,
        minimumPlayers: 1,
        kind: "regular",
        actions: [],
      }],
    });
    const exit = Effect.runSyncExit(Effect.provide(program, Cards.CardCatalogFromJson(bad)));
    expect(exit._tag).toBe("Failure");
  });
});

describe("tag index (admin portal picker)", () => {
  test("maps each emitted tag to the moves that carry it", () => {
    const index = Moves.tagIndex();
    expect(HashMap.get(index, "action")).toEqual(Option.some(["pass"]));
  });

  test("maps each tag to the react moves that respond to it", () => {
    const index = Moves.respondsToIndex();
    expect(HashMap.get(index, "action")).toEqual(Option.some(["counterAttack"]));
  });

  test("is empty for a tag nobody uses", () => {
    expect(Option.isNone(HashMap.get(Moves.tagIndex(), "nonexistent" as never))).toBe(true);
  });
});
