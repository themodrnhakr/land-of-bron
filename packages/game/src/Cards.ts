import { Context, Effect, Hash, Layer, Option, Result, Schema } from "effect";
import { actionBindingSchema, CHECKS, MOVE_CATEGORY_IDS, MOVES } from "./Moves.ts";
import { type Chit, chitSchema } from "./Nation.ts";

// ============================================================================
// Card definitions (data shapes — behavior lives in Moves.ts)
// ============================================================================

const cardBase = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  domains: Schema.Array(Schema.String), // authored; values are domain ids (lint)
  body: Schema.String, // prose — documentation, not behavior
  age: Schema.Number,
  minimumPlayers: Schema.Number, // tier: 3 = used in 3+ player games
});

/** A regular card: a list of (optionally skippable) bound actions. */
export const regularCardSchema = Schema.Struct({
  ...cardBase.fields,
  kind: Schema.Literal("regular"),
  actions: Schema.Array(actionBindingSchema),
});
export type RegularCard = typeof regularCardSchema.Type;

/** One mandate: a check per subtype. The chit on the mat selects the row. */
export const mandateRowSchema = Schema.Struct({
  subtype: Schema.String, // must belong to one of the card's domains (lint)
  description: Schema.String, // prose
  check: Schema.Struct({
    mode: Schema.Literals(["endOfGame", "event"]),
    predicate: Schema.String, // key into CHECKS, lint-checked
    params: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  }),
});
export type MandateRow = typeof mandateRowSchema.Type;

/** A mandate card: per-card VP, one mandate row per subtype of its domain. */
export const mandateCardSchema = Schema.Struct({
  ...cardBase.fields,
  kind: Schema.Literal("mandate"),
  vp: Schema.Number,
  mandates: Schema.Array(mandateRowSchema),
});
export type MandateCard = typeof mandateCardSchema.Type;

export const cardSchema = Schema.Union([regularCardSchema, mandateCardSchema]);
export type Card = typeof cardSchema.Type;

// ============================================================================
// Catalog
// ============================================================================

/** A domain owns its subtypes (per-domain nesting); labels are decoration. */
export const domainSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.optional(Schema.String),
  subtypes: Schema.Array(Schema.Struct({
    id: Schema.String,
    label: Schema.optional(Schema.String),
  })),
});
export type Domain = typeof domainSchema.Type;

/**
 * The whole catalog: vocabularies + cards + chits + version. Loaded via the
 * `CardCatalog` service; the content hash pins a match to this exact content.
 */
export const catalogSchema = Schema.Struct({
  version: Schema.String,
  domains: Schema.Array(domainSchema),
  categoryDomains: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  cards: Schema.Array(cardSchema),
  chits: Schema.Array(chitSchema),
});
export type Catalog = typeof catalogSchema.Type;

/** An empty catalog (dev default — no content yet). */
export const emptyCatalog: Catalog = {
  version: "0",
  domains: [],
  categoryDomains: {},
  cards: [],
  chits: [],
};

/** Look up a card in a catalog. */
export const cardById = (catalog: Catalog, id: string): Option.Option<Card> => {
  const card = catalog.cards.find((c) => c.id === id);
  return card === undefined ? Option.none() : Option.some(card);
};

/** Look up a chit in a catalog. */
export const chitById = (catalog: Catalog, id: string): Option.Option<Chit> => {
  const chit = catalog.chits.find((c) => c.id === id);
  return chit === undefined ? Option.none() : Option.some(chit);
};

// ============================================================================
// Lint + content hash
// ============================================================================

export type LintIssue = { readonly path: string; readonly message: string };

/**
 * Cross-reference checks that make config-authored cards safe: ids resolve,
 * referenced move/check keys exist, subtypes belong to their domains.
 */
export const lintCatalog = (
  catalog: Catalog,
): Result.Result<Catalog, ReadonlyArray<LintIssue>> => {
  const issues: LintIssue[] = [];

  const domainIds = new Set(catalog.domains.map((d) => d.id));
  if (domainIds.size !== catalog.domains.length) {
    issues.push({ path: "domains", message: "duplicate domain id" });
  }
  const subtypeIdsByDomain = new Map<string, Set<string>>();
  for (const d of catalog.domains) {
    subtypeIdsByDomain.set(d.id, new Set(d.subtypes.map((s) => s.id)));
  }

  const cardIds = new Set<string>();
  for (const card of catalog.cards) {
    if (cardIds.has(card.id)) {
      issues.push({ path: `cards.${card.id}`, message: "duplicate card id" });
      continue;
    }
    cardIds.add(card.id);
    for (const d of card.domains) {
      if (!domainIds.has(d)) {
        issues.push({ path: `cards.${card.id}.domains`, message: `unknown domain "${d}"` });
      }
    }
    if (card.kind === "regular") {
      for (const a of card.actions) {
        if (!(a.move in MOVES)) {
          issues.push({ path: `cards.${card.id}.actions`, message: `unknown move "${a.move}"` });
        }
      }
    } else {
      for (const row of card.mandates) {
        if (!(row.check.predicate in CHECKS)) {
          issues.push({ path: `cards.${card.id}.mandates`, message: `unknown check "${row.check.predicate}"` });
        }
        const inDomain = card.domains.some((d) => subtypeIdsByDomain.get(d)?.has(row.subtype));
        if (!inDomain) {
          issues.push({
            path: `cards.${card.id}.mandates`,
            message: `subtype "${row.subtype}" not in any of the card's domains`,
          });
        }
      }
    }
  }

  const chitIds = new Set<string>();
  for (const chit of catalog.chits) {
    if (chitIds.has(chit.id)) {
      issues.push({ path: `chits.${chit.id}`, message: "duplicate chit id" });
      continue;
    }
    chitIds.add(chit.id);
    if (!domainIds.has(chit.domain)) {
      issues.push({ path: `chits.${chit.id}`, message: `unknown domain "${chit.domain}"` });
    }
    if (!subtypeIdsByDomain.get(chit.domain)?.has(chit.subtype)) {
      issues.push({
        path: `chits.${chit.id}`,
        message: `subtype "${chit.subtype}" not in domain "${chit.domain}"`,
      });
    }
    for (const p of chit.powers) {
      if (!(p.move in MOVES)) {
        issues.push({ path: `chits.${chit.id}.powers`, message: `unknown move "${p.move}"` });
      }
    }
  }

  for (const [category, domains] of Object.entries(catalog.categoryDomains)) {
    if (!MOVE_CATEGORY_IDS.some((c) => c === category)) {
      issues.push({ path: "categoryDomains", message: `unknown move category "${category}"` });
    }
    for (const d of domains) {
      if (!domainIds.has(d)) {
        issues.push({ path: `categoryDomains.${category}`, message: `unknown domain "${d}"` });
      }
    }
  }

  return issues.length > 0 ? Result.fail(issues) : Result.succeed(catalog);
};

const sortKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([k, v]) => [k, sortKeysDeep(v)]));
  }
  return value;
};

/** A deterministic content hash — pins a match to this exact catalog. */
export const contentHash = (catalog: Catalog): string => Hash.string(JSON.stringify(sortKeysDeep(catalog))).toString();

// ============================================================================
// CardCatalog service (Effect config) — the DI seam
// ============================================================================

export type CatalogError =
  | { readonly _tag: "InvalidJson"; readonly error: unknown }
  | { readonly _tag: "InvalidCatalog"; readonly error: unknown }
  | { readonly _tag: "LintFailed"; readonly issues: ReadonlyArray<LintIssue> };

/** Decode + lint a raw catalog JSON string. Pure and total. */
export const decodeCatalogJson = (
  json: string,
): Result.Result<Catalog, CatalogError> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return Result.fail({ _tag: "InvalidJson", error });
  }
  const decoded = Schema.decodeUnknownResult(catalogSchema)(parsed);
  if (Result.isFailure(decoded)) {
    return Result.fail({ _tag: "InvalidCatalog", error: decoded.failure });
  }
  const linted = lintCatalog(decoded.success);
  if (Result.isFailure(linted)) {
    return Result.fail({ _tag: "LintFailed", issues: linted.failure });
  }
  return Result.succeed(linted.success);
};

/**
 * The loaded, linted catalog — the single source of card/chit/domain data.
 * Providers (files, DB, ...) feed raw JSON to `CardCatalogFromJson`.
 */
export class CardCatalog extends Context.Service<CardCatalog, {
  readonly catalog: Catalog;
  readonly version: string;
  readonly hash: string;
  readonly card: (id: string) => Option.Option<Card>;
  readonly chit: (id: string) => Option.Option<Chit>;
}>()("CardCatalog") {}

/** Build the service from a raw JSON string (decode + lint at startup). */
export const CardCatalogFromJson = (json: string) =>
  Layer.effect(
    CardCatalog,
    Effect.gen(function*() {
      const catalog = yield* Effect.fromResult(decodeCatalogJson(json));
      return {
        catalog,
        version: catalog.version,
        hash: contentHash(catalog),
        card: (id: string) => cardById(catalog, id),
        chit: (id: string) => chitById(catalog, id),
      };
    }),
  );

/** A pre-built catalog for tests and the dev layer. */
export const CardCatalogFixture = (catalog: Catalog) =>
  Layer.succeed(CardCatalog, {
    catalog,
    version: catalog.version,
    hash: contentHash(catalog),
    card: (id: string) => cardById(catalog, id),
    chit: (id: string) => chitById(catalog, id),
  });
