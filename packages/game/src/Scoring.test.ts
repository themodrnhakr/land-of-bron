import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Option, Schema } from "effect";
import type { Catalog, MandateCard, RegularCard } from "./Cards.ts";
import { CHECKS } from "./Moves.ts";
import type { Nation } from "./Nation.ts";
import * as NationModule from "./Nation.ts";
import * as Scoring from "./Scoring.ts";
import * as State from "./State.ts";

// ============================================================================
// Fixtures
// ============================================================================

// The only built-in check is `always`, so the "not fulfilled" path can only be
// exercised with an injected predicate. This is a gap in the registry, not in
// the scoring code — flag it for Phase 4 when real checks arrive.
const FALSE_CHECK = "__test_never";
beforeAll(() => {
  CHECKS[FALSE_CHECK] = { params: Schema.Struct({}), check: () => false };
});
afterAll(() => {
  Reflect.deleteProperty(CHECKS, FALSE_CHECK);
});

const conquestMandate: MandateCard = {
  id: "mandate-conquest",
  name: "Mandate of Conquest",
  domains: ["military"],
  body: "",
  age: 1,
  minimumPlayers: 1,
  kind: "mandate",
  vp: 3,
  mandates: [
    { subtype: "conquest", description: "", check: { mode: "endOfGame", predicate: "always" } },
    { subtype: "siege", description: "", check: { mode: "endOfGame", predicate: FALSE_CHECK } },
  ],
};

const siegeMandate: MandateCard = {
  id: "mandate-siege",
  name: "Mandate of Siege",
  domains: ["military"],
  body: "",
  age: 1,
  minimumPlayers: 1,
  kind: "mandate",
  vp: 5,
  mandates: [
    { subtype: "siege", description: "", check: { mode: "endOfGame", predicate: "always" } },
  ],
};

const secondConquestMandate: MandateCard = {
  id: "mandate-conquest-2",
  name: "Second Mandate of Conquest",
  domains: ["military"],
  body: "",
  age: 1,
  minimumPlayers: 1,
  kind: "mandate",
  vp: 4,
  mandates: [
    { subtype: "conquest", description: "", check: { mode: "endOfGame", predicate: "always" } },
  ],
};

const regularCard: RegularCard = {
  id: "regular-1",
  name: "Regular Card",
  domains: ["military"],
  body: "",
  age: 1,
  minimumPlayers: 1,
  kind: "regular",
  actions: [],
};

const catalog: Catalog = {
  version: "test",
  domains: [{ id: "military", subtypes: [{ id: "conquest" }, { id: "siege" }] }],
  categoryDomains: {},
  cards: [conquestMandate, siegeMandate, secondConquestMandate, regularCard],
  chits: [
    { id: "chit-conquest", domain: "military", subtype: "conquest", description: "", powers: [] },
    { id: "chit-siege", domain: "military", subtype: "siege", description: "", powers: [] },
    { id: "chit-orphan", domain: "military", subtype: "unknown", description: "", powers: [] },
  ],
};

interface NationOptions {
  readonly chit?: string;
  readonly mandates?: ReadonlyArray<string>;
  readonly score?: number;
  readonly domain?: string;
  readonly omitSlot?: boolean;
}

const makeNation = (opts: NationOptions = {}): Nation => {
  const nation = NationModule.makeNation("red", "Red Empire");
  return {
    ...nation,
    mandates: [...(opts.mandates ?? [])],
    score: opts.score ?? 0,
    mat: {
      cards: [],
      slots: opts.omitSlot ? [] : [{ domain: opts.domain ?? "military", chit: opts.chit }],
    },
  };
};

const makeState = (nation: Nation): State.State => State.make([], [nation], { version: "test", hash: "test-hash" });

// ============================================================================
// applicableMandate
// ============================================================================

describe("applicableMandate", () => {
  test("selects the mandate row named by the chit in the card's domain slot", () => {
    const nation = makeNation({ chit: "chit-conquest" });
    const row = Scoring.applicableMandate(nation, conquestMandate, catalog);
    expect(Option.isSome(row)).toBe(true);
    if (Option.isSome(row)) expect(row.value.subtype).toBe("conquest");
  });

  test("follows the chit: a different chit selects a different row", () => {
    const nation = makeNation({ chit: "chit-siege" });
    const row = Scoring.applicableMandate(nation, conquestMandate, catalog);
    expect(Option.isSome(row)).toBe(true);
    if (Option.isSome(row)) {
      expect(row.value.subtype).toBe("siege");
      expect(row.value.check.predicate).toBe(FALSE_CHECK);
    }
  });

  test("returns none when the mat slot holds no chit", () => {
    expect(Option.isNone(Scoring.applicableMandate(makeNation(), conquestMandate, catalog))).toBe(true);
  });

  test("returns none when the mat has no slot for the card's domain", () => {
    const nation = makeNation({ chit: "chit-conquest", domain: "economic" });
    expect(Option.isNone(Scoring.applicableMandate(nation, conquestMandate, catalog))).toBe(true);
    const noSlots = makeNation({ chit: "chit-conquest", omitSlot: true });
    expect(Option.isNone(Scoring.applicableMandate(noSlots, conquestMandate, catalog))).toBe(true);
  });

  test("returns none when the chit id is not in the catalog", () => {
    const nation = makeNation({ chit: "ghost" });
    expect(Option.isNone(Scoring.applicableMandate(nation, conquestMandate, catalog))).toBe(true);
  });

  test("returns none when the chit's subtype matches no mandate row", () => {
    const nation = makeNation({ chit: "chit-orphan" });
    expect(Option.isNone(Scoring.applicableMandate(nation, conquestMandate, catalog))).toBe(true);
  });

  test("returns none for a card with no domains (documents the card.domains[0] read)", () => {
    const nation = makeNation({ chit: "chit-conquest" });
    const domainless: MandateCard = { ...conquestMandate, domains: [] };
    expect(Option.isNone(Scoring.applicableMandate(nation, domainless, catalog))).toBe(true);
  });
});

// ============================================================================
// mandateFulfilled
// ============================================================================

describe("mandateFulfilled", () => {
  test("is true when the selected predicate holds", () => {
    const nation = makeNation({ chit: "chit-conquest" });
    expect(Scoring.mandateFulfilled(makeState(nation), nation, conquestMandate, catalog)).toBe(true);
  });

  test("is false when the selected predicate does not hold", () => {
    const nation = makeNation({ chit: "chit-siege" });
    expect(Scoring.mandateFulfilled(makeState(nation), nation, conquestMandate, catalog)).toBe(false);
  });

  test("is false when the predicate is not registered", () => {
    const nation = makeNation({ chit: "chit-conquest" });
    const card: MandateCard = {
      ...conquestMandate,
      mandates: [{ subtype: "conquest", description: "", check: { mode: "endOfGame", predicate: "nope" } }],
    };
    expect(Scoring.mandateFulfilled(makeState(nation), nation, card, catalog)).toBe(false);
  });

  test("is false when no mandate is applicable", () => {
    const nation = makeNation();
    expect(Scoring.mandateFulfilled(makeState(nation), nation, conquestMandate, catalog)).toBe(false);
  });
});

// ============================================================================
// victoryPoints
// ============================================================================

describe("victoryPoints", () => {
  test("is zero for a nation holding no mandate cards", () => {
    const nation = makeNation({ chit: "chit-conquest" });
    expect(Scoring.victoryPoints(makeState(nation), catalog, "red")).toBe(0);
  });

  test("counts the vp of a fulfilled mandate card", () => {
    const nation = makeNation({ chit: "chit-conquest", mandates: ["mandate-conquest"] });
    expect(Scoring.victoryPoints(makeState(nation), catalog, "red")).toBe(3);
  });

  test("does not count an unfulfilled mandate card", () => {
    // With the siege chit, mandate-conquest selects its `siege` row, whose
    // predicate is FALSE_CHECK — so it is held but scores nothing.
    const nation = makeNation({ chit: "chit-siege", mandates: ["mandate-conquest"] });
    expect(Scoring.victoryPoints(makeState(nation), catalog, "red")).toBe(0);
    // The same card is worth 3 with the conquest chit.
    const fulfilled = makeNation({ chit: "chit-conquest", mandates: ["mandate-conquest"] });
    expect(Scoring.victoryPoints(makeState(fulfilled), catalog, "red")).toBe(3);
  });

  test("a nation with no chit on the mat scores nothing", () => {
    const nation = makeNation({ mandates: ["mandate-conquest", "mandate-siege"] });
    expect(Scoring.victoryPoints(makeState(nation), catalog, "red")).toBe(0);
  });

  test("sums vp across every fulfilled mandate card", () => {
    // Both cards' `conquest` rows are `always`, so both count: 3 + 4 = 7.
    const nation = makeNation({
      chit: "chit-conquest",
      mandates: ["mandate-conquest", "mandate-conquest-2"],
    });
    expect(Scoring.victoryPoints(makeState(nation), catalog, "red")).toBe(7);
  });

  test("counts only the fulfilled subset when mandates mix", () => {
    // conquest chit: mandate-conquest (3, always) counts;
    // mandate-siege has no `conquest` row, so it does not.
    const nation = makeNation({
      chit: "chit-conquest",
      mandates: ["mandate-conquest", "mandate-siege"],
    });
    expect(Scoring.victoryPoints(makeState(nation), catalog, "red")).toBe(3);
    // siege chit: mandate-siege (5, always) counts; mandate-conquest's siege
    // row is FALSE_CHECK, so it does not.
    const sieging = makeNation({
      chit: "chit-siege",
      mandates: ["mandate-conquest", "mandate-siege"],
    });
    expect(Scoring.victoryPoints(makeState(sieging), catalog, "red")).toBe(5);
  });

  test("ignores non-mandate card ids and ids missing from the catalog", () => {
    const nation = makeNation({
      chit: "chit-conquest",
      mandates: ["regular-1", "does-not-exist", "mandate-conquest"],
    });
    expect(Scoring.victoryPoints(makeState(nation), catalog, "red")).toBe(3);
  });

  test("excludes the flat `score` bonus (mandate VP and bonus VP are separate)", () => {
    const nation = makeNation({ chit: "chit-conquest", mandates: ["mandate-conquest"], score: 7 });
    expect(Scoring.victoryPoints(makeState(nation), catalog, "red")).toBe(3);
  });

  test("is zero for a colour with no seat in the state", () => {
    const nation = makeNation({ chit: "chit-conquest", mandates: ["mandate-conquest"] });
    expect(Scoring.victoryPoints(makeState(nation), catalog, "blue")).toBe(0);
  });
});
