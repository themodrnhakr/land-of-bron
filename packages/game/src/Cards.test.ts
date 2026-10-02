import { describe, expect, test } from "bun:test";
import { HashMap, Option, Result } from "effect";
import type { Catalog, MandateCard, RegularCard } from "./Cards.ts";
import * as Cards from "./Cards.ts";
import type { Chit } from "./Nation.ts";

// ============================================================================
// Fixture builders
// ============================================================================

/** A fully-formed bound action: decode defaults are `optional: false`, `params: {}`. */
const bind = (move: string, overrides: Partial<{ optional: boolean; params: Record<string, unknown> }> = {}) => ({
  move,
  optional: false,
  params: {},
  ...overrides,
});

const regularCard = (overrides: Partial<Omit<RegularCard, "kind">> = {}): RegularCard => ({
  id: "c1",
  name: "Card 1",
  domains: ["d"],
  body: "",
  age: 1,
  minimumPlayers: 1,
  kind: "regular",
  actions: [],
  ...overrides,
});

const mandateCard = (overrides: Partial<Omit<MandateCard, "kind">> = {}): MandateCard => ({
  id: "m1",
  name: "Mandate 1",
  domain: "d",
  body: "",
  age: 1,
  minimumPlayers: 1,
  kind: "mandate",
  vp: 2,
  mandates: [{ subtype: "s", description: "", check: { predicate: "always", params: {} } }],
  ...overrides,
});

const chit = (overrides: Partial<Chit> = {}): Chit => ({
  id: "k1",
  domain: "d",
  subtype: "s",
  description: "",
  powers: [],
  ...overrides,
});

/** A catalog with one domain `d` owning one subtype `s`, and no cards. */
const catalog = (overrides: Partial<Catalog> = {}): Catalog => ({
  version: "1",
  domains: [{ id: "d", subtypes: [{ id: "s" }] }],
  categoryDomains: {},
  cards: [],
  chits: [],
  ...overrides,
});

const lintIssues = (c: Catalog): ReadonlyArray<Cards.LintIssue> => {
  const result = Cards.lintCatalog(c);
  if (Result.isSuccess(result)) throw new Error("expected lint issues, got success");
  return result.failure;
};

// ============================================================================
// Lookups
// ============================================================================

describe("cardById / chitById", () => {
  test("return Option.some for a hit and Option.none for a miss", () => {
    const c = catalog({ cards: [regularCard({ id: "c1" })], chits: [chit({ id: "k1" })] });
    expect(Option.isSome(Cards.cardById(c, "c1"))).toBe(true);
    expect(Option.isNone(Cards.cardById(c, "nope"))).toBe(true);
    expect(Option.isSome(Cards.chitById(c, "k1"))).toBe(true);
    expect(Option.isNone(Cards.chitById(c, "nope"))).toBe(true);
  });

  test("returns the first card when ids are duplicated (lint is what forbids duplicates)", () => {
    const first = regularCard({ id: "c1", name: "First" });
    const second = regularCard({ id: "c1", name: "Second" });
    const found = Cards.cardById(catalog({ cards: [first, second] }), "c1");
    expect(Option.isSome(found)).toBe(true);
    if (Option.isSome(found)) expect(found.value.name).toBe("First");
  });
});

// ============================================================================
// indexCatalog (D8)
// ============================================================================

describe("indexCatalog", () => {
  test("builds O(1) lookups for cards, chits, chits-by-domain, and mandate cards", () => {
    const c = catalog({
      cards: [regularCard({ id: "c1" }), mandateCard({ id: "m1" })],
      chits: [chit({ id: "k1" }), chit({ id: "k2", subtype: "other" })],
    });
    const index = Cards.indexCatalog(c);
    expect(Option.isSome(HashMap.get(index.cardsById, "c1"))).toBe(true);
    expect(Option.isNone(HashMap.get(index.cardsById, "nope"))).toBe(true);
    expect(Option.isSome(HashMap.get(index.chitsById, "k1"))).toBe(true);
    expect(HashMap.get(index.chitsByDomain, "d")).toEqual(Option.some(c.chits));
    expect(index.mandateCards.map((m) => m.id)).toEqual(["m1"]);
  });
});

// ============================================================================
// lintCatalog
// ============================================================================

describe("lintCatalog", () => {
  test("accepts an empty catalog and a well-formed catalog", () => {
    expect(Result.isSuccess(Cards.lintCatalog(Cards.emptyCatalog))).toBe(true);
    const c = catalog({
      cards: [regularCard({ actions: [bind("pass")] }), mandateCard()],
      chits: [chit({ powers: [bind("pass")] })],
      categoryDomains: { action: ["d"] },
    });
    const result = Cards.lintCatalog(c);
    expect(Result.isFailure(result)).toBe(false);
    if (Result.isSuccess(result)) expect(result.success).toEqual(c);
  });

  test("flags an unknown move key on a card action", () => {
    const issues = lintIssues(catalog({ cards: [regularCard({ actions: [bind("nope")] })] }));
    expect(issues).toContainEqual({ path: "cards.c1.actions", message: "unknown move \"nope\"" });
  });

  test("flags an unknown move key on a chit power", () => {
    const issues = lintIssues(catalog({ chits: [chit({ powers: [bind("nope")] })] }));
    expect(issues).toContainEqual({ path: "chits.k1.powers", message: "unknown move \"nope\"" });
  });

  test("flags an unknown check predicate on a mandate row", () => {
    const card = mandateCard({
      mandates: [{ subtype: "s", description: "", check: { predicate: "nope", params: {} } }],
    });
    const issues = lintIssues(catalog({ cards: [card] }));
    expect(issues).toContainEqual({ path: "cards.m1.mandates", message: "unknown check \"nope\"" });
  });

  test("flags an unknown domain", () => {
    const cardIssues = lintIssues(catalog({ cards: [regularCard({ domains: ["zzz"] })] }));
    expect(cardIssues).toContainEqual({
      path: "cards.c1.domains",
      message: "unknown domain \"zzz\"",
    });
    const chitIssues = lintIssues(catalog({ chits: [chit({ domain: "zzz" })] }));
    expect(chitIssues).toContainEqual({ path: "chits.k1", message: "unknown domain \"zzz\"" });
  });

  test("flags a mandate card's unknown single domain", () => {
    const issues = lintIssues(catalog({ cards: [mandateCard({ domain: "zzz" })] }));
    expect(issues).toContainEqual({ path: "cards.m1.domains", message: "unknown domain \"zzz\"" });
  });

  test("flags duplicate card ids", () => {
    const issues = lintIssues(catalog({ cards: [regularCard(), regularCard()] }));
    expect(issues).toContainEqual({ path: "cards.c1", message: "duplicate card id" });
  });

  test("flags duplicate chit ids", () => {
    const issues = lintIssues(catalog({ chits: [chit(), chit()] }));
    expect(issues).toContainEqual({ path: "chits.k1", message: "duplicate chit id" });
  });

  test("flags duplicate domain ids", () => {
    const issues = lintIssues(
      catalog({ domains: [{ id: "d", subtypes: [] }, { id: "d", subtypes: [] }] }),
    );
    expect(issues).toContainEqual({ path: "domains", message: "duplicate domain id" });
  });

  test("flags a mandate subtype that is not in the card's domain", () => {
    const card = mandateCard({
      mandates: [{ subtype: "other", description: "", check: { predicate: "always", params: {} } }],
    });
    const issues = lintIssues(catalog({ cards: [card] }));
    expect(issues).toContainEqual({
      path: "cards.m1.mandates",
      message: "subtype \"other\" not in domain \"d\"",
    });
  });

  test("flags a chit subtype that is not in its domain", () => {
    const issues = lintIssues(catalog({ chits: [chit({ subtype: "nope" })] }));
    expect(issues).toContainEqual({
      path: "chits.k1",
      message: "subtype \"nope\" not in domain \"d\"",
    });
  });

  test("flags an unknown move category", () => {
    const issues = lintIssues(catalog({ categoryDomains: { bogus: ["d"] } }));
    expect(issues).toContainEqual({
      path: "categoryDomains",
      message: "unknown move category \"bogus\"",
    });
  });

  test("flags an unknown domain inside a category mapping", () => {
    const issues = lintIssues(catalog({ categoryDomains: { action: ["zzz"] } }));
    expect(issues).toContainEqual({ path: "categoryDomains.action", message: "unknown domain \"zzz\"" });
  });

  test("reports every issue at once rather than stopping at the first", () => {
    const issues = lintIssues(
      catalog({
        cards: [regularCard({ actions: [bind("nope")], domains: ["zzz"] }), mandateCard()],
        chits: [chit({ subtype: "nope" })],
      }),
    );
    expect(issues).toHaveLength(3);
    expect(issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "unknown move \"nope\"",
        "unknown domain \"zzz\"",
        "subtype \"nope\" not in domain \"d\"",
      ]),
    );
  });

  test("rejects keys inherited from Object.prototype (D16)", () => {
    // The old `a.move in MOVES` check walked the prototype chain, so
    // "toString", "constructor", ... were accepted. Membership is now a
    // HashSet built from the registry, so they are reported instead.
    for (const key of ["toString", "constructor", "valueOf", "hasOwnProperty", "__proto__"]) {
      const moveIssues = lintIssues(
        catalog({ cards: [regularCard({ actions: [bind(key)] })] }),
      );
      expect(moveIssues).toContainEqual({
        path: "cards.c1.actions",
        message: `unknown move "${key}"`,
      });

      const checkIssues = lintIssues(
        catalog({
          cards: [
            mandateCard({
              mandates: [{ subtype: "s", description: "", check: { predicate: key, params: {} } }],
            }),
          ],
        }),
      );
      expect(checkIssues).toContainEqual({
        path: "cards.m1.mandates",
        message: `unknown check "${key}"`,
      });
    }
  });

  test("validates binding.params against the move's params schema (D4)", () => {
    // `counterAttack` requires `{ at: Coords }`.
    const bad = lintIssues(catalog({ cards: [regularCard({ actions: [bind("counterAttack")] })] }));
    expect(bad).toHaveLength(1);
    expect(bad[0]!.path).toBe("cards.c1.actions");
    expect(bad[0]!.message).toContain("params do not match move \"counterAttack\"");

    const good = Cards.lintCatalog(
      catalog({
        cards: [regularCard({ actions: [bind("counterAttack", { params: { at: { q: 0, r: 0 } } })] })],
      }),
    );
    expect(Result.isSuccess(good)).toBe(true);
  });

  test("validates check.params against the check's params schema (D4)", () => {
    const c = catalog({
      cards: [
        mandateCard({
          mandates: [{
            subtype: "s",
            description: "",
            check: { predicate: "always", params: {} },
          }],
        }),
      ],
    });
    expect(Result.isSuccess(Cards.lintCatalog(c))).toBe(true);
  });
});

// ============================================================================
// contentHash
// ============================================================================

describe("contentHash", () => {
  test("is stable across object key order", () => {
    const a: Catalog = {
      version: "1",
      domains: [{ id: "d", subtypes: [{ id: "s" }] }],
      categoryDomains: {},
      cards: [],
      chits: [],
    };
    // Same content, keys written in a different order (including nested ones).
    const b = {
      chits: [],
      cards: [],
      categoryDomains: {},
      domains: [{ subtypes: [{ id: "s" }], id: "d" }],
      version: "1",
    } as Catalog;
    expect(Cards.contentHash(a)).toBe(Cards.contentHash(b));
  });

  test("changes when content changes", () => {
    const base = catalog();
    expect(Cards.contentHash(catalog({ version: "2" }))).not.toBe(Cards.contentHash(base));
    expect(Cards.contentHash(catalog({ cards: [regularCard({ name: "Renamed" })] }))).not.toBe(
      Cards.contentHash(base),
    );
    expect(Cards.contentHash(catalog({ cards: [mandateCard({ vp: 3 })] }))).not.toBe(
      Cards.contentHash(catalog({ cards: [mandateCard({ vp: 4 })] })),
    );
  });

  test("is sensitive to array order (object keys are sorted, arrays are not)", () => {
    const one = regularCard({ id: "a" });
    const two = regularCard({ id: "b" });
    expect(Cards.contentHash(catalog({ cards: [one, two] }))).not.toBe(
      Cards.contentHash(catalog({ cards: [two, one] })),
    );
  });

  test("pins the hash of the empty catalog (a change here invalidates stored catalog pins)", () => {
    expect(Cards.contentHash(Cards.emptyCatalog)).toBe("197713697");
  });
});

// ============================================================================
// decodeCatalogJson
// ============================================================================

describe("decodeCatalogJson", () => {
  test("returns InvalidJson for unparseable input", () => {
    const result = Cards.decodeCatalogJson("{not json");
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) expect(result.failure._tag).toBe("InvalidJson");
  });

  test("returns InvalidCatalog when the JSON does not match the schema", () => {
    const result = Cards.decodeCatalogJson(JSON.stringify({ version: 1 }));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) expect(result.failure._tag).toBe("InvalidCatalog");
  });

  test("returns LintFailed when the JSON decodes but does not lint", () => {
    const bad = catalog({ cards: [regularCard({ actions: [bind("nope")] })] });
    const result = Cards.decodeCatalogJson(JSON.stringify(bad));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure._tag).toBe("LintFailed");
      if (result.failure._tag === "LintFailed") {
        expect(result.failure.issues).toContainEqual({
          path: "cards.c1.actions",
          message: "unknown move \"nope\"",
        });
      }
    }
  });

  test("round-trips a valid catalog", () => {
    const valid = catalog({ cards: [mandateCard()], chits: [chit()] });
    const result = Cards.decodeCatalogJson(JSON.stringify(valid));
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) expect(result.success).toEqual(valid);
  });

  test("applies decode defaults for omitted action-binding fields", () => {
    // A hand-authored catalog may omit `optional` and `params`; decoding fills
    // them in (D20).
    const json = JSON.stringify({
      version: "1",
      domains: [{ id: "d", subtypes: [] }],
      categoryDomains: {},
      chits: [],
      cards: [{
        id: "c1",
        name: "C",
        domains: ["d"],
        body: "",
        age: 1,
        minimumPlayers: 1,
        kind: "regular",
        actions: [{ move: "pass" }],
      }],
    });
    const result = Cards.decodeCatalogJson(json);
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result) && result.success.cards[0]!.kind === "regular") {
      expect(result.success.cards[0]!.actions[0]).toEqual({ move: "pass", optional: false, params: {} });
    }
  });

  test("accepts the empty catalog", () => {
    const result = Cards.decodeCatalogJson(JSON.stringify(Cards.emptyCatalog));
    expect(Result.isSuccess(result)).toBe(true);
  });
});
