import { describe, expect, test } from "bun:test";
import { Option, Result } from "effect";
import type { Catalog, MandateCard, RegularCard } from "./Cards.ts";
import * as Cards from "./Cards.ts";
import type { Chit } from "./Nation.ts";

// ============================================================================
// Fixture builders
// ============================================================================

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
  domains: ["d"],
  body: "",
  age: 1,
  minimumPlayers: 1,
  kind: "mandate",
  vp: 2,
  mandates: [{ subtype: "s", description: "", check: { mode: "endOfGame", predicate: "always" } }],
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
// lintCatalog
// ============================================================================

describe("lintCatalog", () => {
  test("accepts an empty catalog and a well-formed catalog", () => {
    expect(Result.isSuccess(Cards.lintCatalog(Cards.emptyCatalog))).toBe(true);
    const c = catalog({
      cards: [regularCard({ actions: [{ move: "pass" }] }), mandateCard()],
      chits: [chit({ powers: [{ move: "pass" }] })],
      categoryDomains: { action: ["d"] },
    });
    const result = Cards.lintCatalog(c);
    expect(Result.isFailure(result)).toBe(false);
    if (Result.isSuccess(result)) expect(result.success).toEqual(c);
  });

  test("flags an unknown move key on a card action", () => {
    const issues = lintIssues(catalog({ cards: [regularCard({ actions: [{ move: "nope" }] })] }));
    expect(issues).toContainEqual({ path: "cards.c1.actions", message: "unknown move \"nope\"" });
  });

  test("flags an unknown move key on a chit power", () => {
    const issues = lintIssues(catalog({ chits: [chit({ powers: [{ move: "nope" }] })] }));
    expect(issues).toContainEqual({ path: "chits.k1.powers", message: "unknown move \"nope\"" });
  });

  test("flags an unknown check predicate on a mandate row", () => {
    const card = mandateCard({
      mandates: [{ subtype: "s", description: "", check: { mode: "endOfGame", predicate: "nope" } }],
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

  test("flags a mandate subtype that belongs to none of the card's domains", () => {
    const card = mandateCard({
      mandates: [{ subtype: "other", description: "", check: { mode: "endOfGame", predicate: "always" } }],
    });
    const issues = lintIssues(catalog({ cards: [card] }));
    expect(issues).toContainEqual({
      path: "cards.m1.mandates",
      message: "subtype \"other\" not in any of the card's domains",
    });
  });

  test("flags a mandate subtype whose domain list is empty", () => {
    const issues = lintIssues(catalog({ cards: [mandateCard({ domains: [] })] }));
    expect(issues).toContainEqual({
      path: "cards.m1.mandates",
      message: "subtype \"s\" not in any of the card's domains",
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
        cards: [regularCard({ actions: [{ move: "nope" }], domains: ["zzz"] }), mandateCard()],
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

  test("KNOWN BUG: keys inherited from Object.prototype pass the registry check", () => {
    // `a.move in MOVES` walks the prototype chain, so "toString",
    // "constructor", "__proto__", ... are all accepted as valid move/check
    // names. The check needs Object.hasOwn (or a Map/HashMap) instead.
    const moveIssues = Cards.lintCatalog(
      catalog({ cards: [regularCard({ actions: [{ move: "toString" }] })] }),
    );
    expect(Result.isSuccess(moveIssues)).toBe(true);

    const checkIssues = Cards.lintCatalog(
      catalog({
        cards: [
          mandateCard({
            mandates: [{
              subtype: "s",
              description: "",
              check: { mode: "endOfGame", predicate: "constructor" },
            }],
          }),
        ],
      }),
    );
    expect(Result.isSuccess(checkIssues)).toBe(true);
  });

  test("KNOWN GAP: binding.params are not validated against the move's params schema (D4)", () => {
    // `counterAttack` declares `params: { at: Coords }`, yet a binding with no
    // params passes lint. PLAN.md D4 settles that this must be reported as a
    // LintIssue; this test documents the gap so the fix is a visible change.
    const issues = Cards.lintCatalog(
      catalog({ cards: [regularCard({ actions: [{ move: "counterAttack" }] })] }),
    );
    expect(Result.isSuccess(issues)).toBe(true);
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
    const bad = catalog({ cards: [regularCard({ actions: [{ move: "nope" }] })] });
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

  test("accepts the empty catalog", () => {
    const result = Cards.decodeCatalogJson(JSON.stringify(Cards.emptyCatalog));
    expect(Result.isSuccess(result)).toBe(true);
  });
});
