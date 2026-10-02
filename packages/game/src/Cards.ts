import { Array, Context, Effect, HashMap, HashSet, Layer, Option, Result, Schema } from "effect";
import { structuralHash } from "./ContentHash.ts";
import { actionBindingSchema, CHECK_IDS, CHECKS, MOVE_CATEGORY_IDS, MOVE_IDS, type MoveId, MOVES } from "./Moves.ts";
import { type Chit, chitSchema } from "./Nation.ts";

// ============================================================================
// Card definitions (data shapes — behavior lives in Moves.ts)
// ============================================================================

const cardIdentity = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  body: Schema.String, // prose — documentation, not behavior
  age: Schema.Number,
  minimumPlayers: Schema.Number, // tier: 3 = used in 3+ player games
});

/** A regular card: a list of (optionally skippable) bound actions. */
export const regularCardSchema = Schema.Struct({
  ...cardIdentity.fields,
  kind: Schema.Literal("regular"),
  domains: Schema.Array(Schema.String), // authored; values are domain ids (lint)
  actions: Schema.Array(actionBindingSchema),
});
export type RegularCard = typeof regularCardSchema.Type;

/**
 * One mandate: a check per subtype. The chit on the mat selects the row.
 *
 * Mandate cards are single-domain (D7) — the domain is singular here so there
 * is no `domains[0]` to get wrong.
 */
export const mandateRowSchema = Schema.Struct({
  subtype: Schema.String, // must belong to the card's domain (lint)
  description: Schema.String, // prose
  check: Schema.Struct({
    predicate: Schema.String, // key into CHECKS, lint-checked
    params: Schema.Record(Schema.String, Schema.Unknown).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed({})),
    ),
  }),
});
export type MandateRow = typeof mandateRowSchema.Type;

/** A mandate card: per-card VP, one mandate row per subtype of its domain. */
export const mandateCardSchema = Schema.Struct({
  ...cardIdentity.fields,
  kind: Schema.Literal("mandate"),
  domain: Schema.String, // single domain (D7)
  vp: Schema.Number,
  mandates: Schema.Array(mandateRowSchema),
});
export type MandateCard = typeof mandateCardSchema.Type;

export const cardSchema = Schema.Union([regularCardSchema, mandateCardSchema]);
export type Card = typeof cardSchema.Type;

/** Every card, mandate or regular, carries these identity fields. */
export type CardIdentity = typeof cardIdentity.Type;

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
export const cardById = (catalog: Catalog, id: string): Option.Option<Card> =>
  Array.findFirst(catalog.cards, (c) => c.id === id);

/** Look up a chit in a catalog. */
export const chitById = (catalog: Catalog, id: string): Option.Option<Chit> =>
  Array.findFirst(catalog.chits, (c) => c.id === id);

// ============================================================================
// Lint + content hash
// ============================================================================

export type LintIssue = { readonly path: string; readonly message: string };

const paramIssue = (
  path: string,
  schema: Schema.ConstraintDecoder<unknown>,
  params: Record<string, unknown>,
  label: string,
): LintIssue | undefined => {
  const decoded = Schema.decodeUnknownResult(schema)(params);
  return Result.isFailure(decoded)
    ? { path, message: `params do not match ${label}: ${decoded.failure.message}` }
    : undefined;
};

/**
 * Cross-reference checks that make config-authored cards safe: ids resolve,
 * referenced move/check keys exist (prototype-safe via `HashSet` — finding A),
 * `params` decode against the referenced move/check schema (D4), and subtypes
 * belong to their domains.
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
    const domains: ReadonlyArray<string> = card.kind === "regular" ? card.domains : [card.domain];
    for (const d of domains) {
      if (!domainIds.has(d)) {
        issues.push({ path: `cards.${card.id}.domains`, message: `unknown domain "${d}"` });
      }
    }
    if (card.kind === "regular") {
      for (const a of card.actions) {
        if (!HashSet.has(MOVE_IDS, a.move)) {
          issues.push({ path: `cards.${card.id}.actions`, message: `unknown move "${a.move}"` });
          continue;
        }
        const issue = paramIssue(
          `cards.${card.id}.actions`,
          MOVES[a.move as MoveId]!.params,
          a.params,
          `move "${a.move}"`,
        );
        if (issue !== undefined) issues.push(issue);
      }
    } else {
      for (const row of card.mandates) {
        if (!HashSet.has(CHECK_IDS, row.check.predicate)) {
          issues.push({ path: `cards.${card.id}.mandates`, message: `unknown check "${row.check.predicate}"` });
        } else {
          const issue = paramIssue(
            `cards.${card.id}.mandates`,
            CHECKS[row.check.predicate]!.params,
            row.check.params,
            `check "${row.check.predicate}"`,
          );
          if (issue !== undefined) issues.push(issue);
        }
        const inDomain = subtypeIdsByDomain.get(card.domain)?.has(row.subtype) ?? false;
        if (!inDomain) {
          issues.push({
            path: `cards.${card.id}.mandates`,
            message: `subtype "${row.subtype}" not in domain "${card.domain}"`,
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
      if (!HashSet.has(MOVE_IDS, p.move)) {
        issues.push({ path: `chits.${chit.id}.powers`, message: `unknown move "${p.move}"` });
        continue;
      }
      const issue = paramIssue(
        `chits.${chit.id}.powers`,
        MOVES[p.move as MoveId]!.params,
        p.params,
        `move "${p.move}"`,
      );
      if (issue !== undefined) issues.push(issue);
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

/** A deterministic content hash — pins a match to this exact catalog. */
export const contentHash = (catalog: Catalog): string => structuralHash(catalog);

// ============================================================================
// Catalog index (D8)
// ============================================================================

/**
 * Normalized, O(1) lookups built once at load. Held by the `CardCatalog`
 * service so no caller has to scan the catalog arrays.
 */
export interface CatalogIndex {
  readonly cardsById: HashMap.HashMap<string, Card>;
  readonly chitsById: HashMap.HashMap<string, Chit>;
  readonly chitsByDomain: HashMap.HashMap<string, ReadonlyArray<Chit>>;
  readonly mandateCards: ReadonlyArray<MandateCard>;
}

/** Build the index for a (linted) catalog. */
export const indexCatalog = (catalog: Catalog): CatalogIndex => {
  const cardsById = HashMap.fromIterable(
    catalog.cards.map((c): [string, Card] => [c.id, c]),
  );
  const chitsById = HashMap.fromIterable(
    catalog.chits.map((c): [string, Chit] => [c.id, c]),
  );
  let chitsByDomain = HashMap.empty<string, ReadonlyArray<Chit>>();
  for (const chit of catalog.chits) {
    const existing = HashMap.get(chitsByDomain, chit.domain);
    const next = Option.isSome(existing) ? [...existing.value, chit] : [chit];
    chitsByDomain = HashMap.set(chitsByDomain, chit.domain, next);
  }
  return {
    cardsById,
    chitsById,
    chitsByDomain,
    mandateCards: catalog.cards.filter((c): c is MandateCard => c.kind === "mandate"),
  };
};

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
  readonly index: CatalogIndex;
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
      const index = indexCatalog(catalog);
      return {
        catalog,
        index,
        version: catalog.version,
        hash: contentHash(catalog),
        card: (id: string) => HashMap.get(index.cardsById, id),
        chit: (id: string) => HashMap.get(index.chitsById, id),
      };
    }),
  );

/** A pre-built catalog for tests and the dev layer. */
export const CardCatalogFixture = (catalog: Catalog) => {
  const index = indexCatalog(catalog);
  return Layer.succeed(CardCatalog, {
    catalog,
    index,
    version: catalog.version,
    hash: contentHash(catalog),
    card: (id: string) => HashMap.get(index.cardsById, id),
    chit: (id: string) => HashMap.get(index.chitsById, id),
  });
};
