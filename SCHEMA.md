# Land of Bron — Schema Inventory

Snapshot of every Effect `Schema` and the code-side contracts in `packages/game/src`, brought up to
date after Phases 2–6. Companion to `PLAN.md`; the decision-log entries it references are in
`PLAN.md` section 3. Scratch document — delete when it stops being useful.

Legend: `opt` = `Schema.optional(...)` · `OptFromOpt` = `Schema.OptionFromOptional(...)` (absent key ⇄ `None`, D20) · `= X` = decoding default · ⚠ = noted irregularity · **AUT** = an autonomous decision in this run.

---

## Coords.ts — hex primitives

```ts
coordsSchema = Struct({ q: Number, r: Number })          type Coords = { q; r }
cubeSchema   = Struct({ q: Number, r: Number, s: Number }) type Cube = { q; r; s }
  ⚠ q + r + s === 0 is documented but NOT enforced

ORIGIN, DIRECTIONS (6 axial vectors)
toCube, fromCube, hexDistance, add
```

## Tile.ts — geography + control

```ts
terrainIdSchema = String                                  type TerrainId
  // a plain validated string; the valid set is the configured terrain table (D21)

tileSchema = Struct({
  coords:  coordsSchema,
  terrain: terrainIdSchema,
  color:   OptFromOpt(colorSchema),   // home nation; None on sea
  control: OptFromOpt(colorSchema),   // OVERRIDE ONLY; None = home controls (D19)
})
  type Tile

fromCoords(coords, color | undefined, terrain) -> Tile    // control always None
effectiveControl(tile) -> Option<Color>                   // override else home; None on sea
homeColor(tile) -> Option<Color>
```

`landTerrainSchema` / `terrainNameSchema` / `LandTerrain` / `TerrainName` are **gone** (D21).

## Nation.ts — the player seat

```ts
colorSchema = Literals(["red","orange","yellow","green","blue","indigo","violet"])  type Color

MAX_MAT_CARDS = 3
matSchema = Struct({
  cards: Array(String).check(isMaxLength(3)),             // at most 3 (D24)
  slots: Array(Struct({ domain: String, chit: OptFromOpt(String) })),
})  type Mat

chitSchema = Struct({
  id, domain, subtype, description: String,
  powers: Array(actionBindingSchema),
})  type Chit

nationSchema = Struct({
  color, name: colorSchema, String,
  hand, deck, discard, playArea, mandates: Array(String),
  mat: matSchema,
  score: Number,
  influence:   Array(Struct({ face: influenceFaces, at: OptFromOpt(coordsSchema) })),
  religion:    Array(Struct({ face: religionFaces,  at: OptFromOpt(coordsSchema) })),
  controlChits:Array(Struct({ at: OptFromOpt(coordsSchema) })),
  units:       Array(Struct({ kind: unitKinds,     at: OptFromOpt(coordsSchema) })),
  production:  Array(Struct({ kind: productionIdSchema, at: OptFromOpt(coordsSchema) })),   // production id (D52)
  defenseStructures: Array(Struct({ kind: defenseStructureKindSchema, at: OptFromOpt(coordsSchema) })), // per-type cap (D54)
  supplyLines: Array(Struct({ at: OptFromOpt(coordsSchema), maintenanceCost: Array(resourceAmountSchema) })), // D54/D57
  railroads:   Array(Struct({ at: OptFromOpt(edgeSchema) })),   // edge piece (D55)
  ports:       Array(Struct({ at: OptFromOpt(edgeSchema) })),   // edge piece on a land<->sea edge (D55)
  ships:       Array(Struct({ kind: shipKinds, at: OptFromOpt(coordsSchema) })),  // sea piece (D56)
  population:  Array(Struct({ at: OptFromOpt(coordsSchema) })),
  tradePosts:  Array(Struct({ at: OptFromOpt(coordsSchema) })),
  embassy: Array(Struct({ host: colorSchema })),          // one per OTHER nation, host only (D22)
  capital: OptFromOpt(coordsSchema),
})  type Nation
  type Embassy = nationSchema.fields.embassy.Type[number]

NationSupplySpec = { productionKind?: string; defenseTypes?: {id, cap}[]; supplyLineMaintenance?: ResourceAmount[] }
makeNation(color, name, limits = PIECE_LIMITS, otherColors = [], spec = {}) -> Nation
  // embassy = otherColors minus self, one entry each
  // defense supply built per type from spec.defenseTypes; ships = total-length pool,
  // merchantShips merchants + navalShips navies (divisible per-type caps as the pool composition)
```

## Pieces.ts — piece faces, supply caps, placement

```ts
influenceFaces = Literals(["influence","goodwill"])
religionFaces  = Literals(["proselytized","converted"])   // typo fixed (Phase 2 item 1)
unitKinds      = Literals(["army","missionary"])
productionIdSchema = NonEmptyString                       // re-exported from Resources (D52); no more Literals(["farm"])
defenseStructureKindSchema = NonEmptyString               // id from the defense catalogue (D54)
shipKinds      = Literals(["merchant", "naval"])          // D56

PIECE_LIMITS = {
  influence:8, religion:6, controlChits:4, units:8, production:6, population:6, tradePosts:3,
  supplyLines:4, railroads:6, ports:3,                    // per-nation caps (D54/D55)
  ships:6, merchantShips:3, navalShips:3,                 // total + per-type ship caps (D56)
} as const
PIECE_LIMIT_KEYS = readonly ["influence", ...]            // matches PIECE_LIMITS keys
type PieceLimits = Record<keyof typeof PIECE_LIMITS, number>   // widened, no cast needed (D14/D26)
MAX_PIECE_LIMIT = 100
shipCapIssues(limits) -> string[]                         // each type <= total; sum >= total (D56)

type Placed<A, L> = A & { readonly at: Option<Option<L>> }     // L = Coords (tile) or Edge (D55)
type PlacedPiece<A = unknown> = Placed<A, Coords>
makeSupply(count, data)     -> PlacedPiece<A>[]  // tile-located; every piece at = None
makeEdgeSupply(count, data) -> Placed<A, Edge>[] // edge-located (railroads/ports)
place(piece, at), returnToPool(piece)        // immutable; infer the location type
poolCount(pieces), onBoardCount(pieces)
```

## Moves.ts — registries + contracts

```ts
MOVE_CATEGORY_IDS = ["action","react","trigger","passive"]
moveCategorySchema = Literals(MOVE_CATEGORY_IDS)

KNOWN_TAGS = ["action"]               // code-side event vocabulary; non-empty, grows in Phase 4 (D28/D44)
type Tag = typeof KNOWN_TAGS[number]
tagSchema = Literals(KNOWN_TAGS)

actionBindingSchema = Struct({
  move: String,                        // key into MOVES (lint-checked, HashSet)
  optional: Boolean = false,           // decoding default (D20)
  params: Record(String, Unknown) = {},// decoding default (D20); validated in lint (D4)
})  type ActionBinding

interface MoveMetadata { categories: ReadonlyArray<MoveCategoryId>; tags?: ReadonlyArray<Tag> }
interface MoveDefinition<P> extends MoveMetadata {
  respondsTo?: ReadonlyArray<Tag>
  params: Schema.ConstraintDecoder<P>
  canApply: (ctx, p) => Result<boolean, MoveError>
  apply:    (ctx, p) => Result<MoveOutcome, MoveError>
}
type MoveError = { _tag:"Unimplemented"; move } | { _tag:"Illegal"; reason }

interface MoveContext { state: State; actor: Color; turn: number; phase: Phase; pendingEvent?: GameEvent }
interface MoveOutcome { state: State; veto?: boolean; event?: GameEvent }   // veto/event for interrupts (D13)

interface CheckDefinition<P> { params: Schema.ConstraintDecoder<P>; check: (state, p) => boolean }

MOVES = { pass, counterAttack }        type MoveId = keyof typeof MOVES
  // pass: categories ["action"], tags ["action"], params {}
  // counterAttack: categories ["react"], respondsTo ["action"], params { at: Coords },
  //   canApply = the target cell exists on the board (structural placeholder, D43)
CHECKS = { always }

MOVE_IDS, CHECK_IDS: HashSet<string>   // prototype-safe membership (D16)
tagIndex(), respondsToIndex(): HashMap<Tag, ReadonlyArray<MoveId>>  // admin-portal picker (D51)
```

## Cards.ts — the catalog

```ts
cardIdentity = Struct({ id, name, body: String, age, minimumPlayers: Number })

regularCardSchema = Struct({
  ...cardIdentity, kind: Literal("regular"),
  domains: Array(String),              // authored; domain ids (lint)
  actions: Array(actionBindingSchema),
})  type RegularCard

mandateRowSchema = Struct({
  subtype: String,                     // must be in the card's domain (lint)
  description: String,
  check: Struct({
    predicate: String,                 // key into CHECKS (lint); `mode` DELETED (D6)
    params: Record(String, Unknown) = {},  // default {}; validated in lint (D4)
  }),
})  type MandateRow

mandateCardSchema = Struct({
  ...cardIdentity, kind: Literal("mandate"),
  domain: String,                      // SINGLE domain (D7) — no domains[0]
  vp: Number,
  mandates: Array(mandateRowSchema),
})  type MandateCard

cardSchema = Union([regularCardSchema, mandateCardSchema])   type Card
type CardIdentity = typeof cardIdentity.Type

domainSchema = Struct({ id, label: opt(String), subtypes: Array(Struct({ id, label: opt(String) })) })
catalogSchema = Struct({ version, domains, categoryDomains: Record(String, Array(String)), cards, chits })
  type Catalog

emptyCatalog
cardById(catalog, id) / chitById(catalog, id) -> Option   // Array.findFirst

type LintIssue = { path: string; message: string }
lintCatalog(catalog) -> Result<Catalog, ReadonlyArray<LintIssue>>
  // HashSet membership (D16), params decoded against MOVES/CHECKS schemas (D4),
  // single-domain mandate subtypes, duplicate ids, category checks
contentHash(catalog) -> string                            // structuralHash (ContentHash.ts)

interface CatalogIndex {
  cardsById, chitsById: HashMap<string, ...>
  chitsByDomain: HashMap<string, ReadonlyArray<Chit>>
  mandateCards: ReadonlyArray<MandateCard>
}
indexCatalog(catalog) -> CatalogIndex                     // D8

type CatalogError = InvalidJson | InvalidCatalog | LintFailed
decodeCatalogJson(json) -> Result<Catalog, CatalogError>

class CardCatalog extends Context.Service<CardCatalog, {
  catalog; index; version; hash
  card(id) -> Option<Card>; chit(id) -> Option<Chit>      // HashMap-backed
}>
CardCatalogFromJson(json) -> Layer                        // decode + lint at startup
CardCatalogFixture(catalog) -> Layer
```

## Scoring.ts — mandate selectors

```ts
applicableMandate(nation, card, catalog) -> Option<MandateRow>   // card.domain (singular), findFirst chain
mandateFulfilled(state, nation, card, catalog) -> boolean
  // hardened: predicate id checked against CHECK_IDS HashSet -> false, never throws (D16)

interface MandateStatus { color; cardId; row: Option<MandateRow>; fulfilled: boolean; vp: number }
mandateStatus(state, catalog) -> ReadonlyArray<MandateStatus>              // full state, server/end-of-game (D6)
mandateStatusForViewer(state, catalog, viewer) -> ReadonlyArray<...>       // viewer only; null = none
victoryPoints(state, catalog, color) -> number                            // sum of fulfilled mandate vp
```

Mandates do **not** drive `endIf` (D6/D11).

## State.ts — the `G` shape

```ts
class Config extends TaggedClass("State/Config", { name, minPlayers, maxPlayers })  // Service.make arg (D25)

phaseSchema = Literals(["action"])   type Phase
reactionPhaseSchema = Literals(["interrupt","trigger"])   type ReactionPhase

gameEventSchema = Struct({
  seq: Number, move: String,
  categories: Array(moveCategorySchema),   // structural
  tags: Array(tagSchema),                  // semantic event kinds (D28)
  actor: colorSchema,
  at: OptFromOpt(coordsSchema),
  target: OptFromOpt(colorSchema),         // single optional target (D31)
  params: Record(String, Unknown),
  turn: Number,
})  type GameEvent

reactionDeclarationSchema = Struct({ seq: Number, actor: colorSchema, move: String, params: Record(String, Unknown) })
  type ReactionDeclaration
pendingReactionsSchema = Struct({
  event: gameEventSchema,
  phase: reactionPhaseSchema,
  eligible: Array(colorSchema),            // resolution order: target first, then seat order (D13)
  declarations: Array(reactionDeclarationSchema),   // public, declaration order
  passed: Array(colorSchema),
})  type PendingReactions

catalogPinSchema = Struct({ version, hash })   type CatalogPin
terrainPinSchema = Struct({ version, hash })   type TerrainPin
productionPinSchema = Struct({ version, hash }) type ProductionPin   // D52

class State extends TaggedClass("State", {
  tiles: Array(tileSchema), nations: Array(nationSchema), events: Array(gameEventSchema),
  catalog: catalogPinSchema, terrain: terrainPinSchema, production: productionPinSchema,
  pendingReactions: OptFromOpt(pendingReactionsSchema),   // None = no window (D47)
}) {}

make(tiles, nations, catalog, terrain, production) -> State   // events [], pendingReactions None

// Framework boundary (D40): boardgame.io requires plain JSON, Effect Option is a class instance.
type StateEncoded = Schema.Codec.Encoded<typeof State>
encode(state: State) -> StateEncoded                      // Schema.encodeSync
decodeUnknown(input: unknown) -> State                    // Schema.decodeUnknownSync
```

`State.turn` / `State.phase` are **gone** (D12).

## Setup.ts — per-match `setupData`

```ts
DEFAULT_NATION_NAMES, DEFAULT_STRATEGY
  // DEFAULT_LAND_TERRAIN and the per-match `terrain` option are GONE (D21)

pieceLimitSchema = Int.check(>= 1, <= MAX_PIECE_LIMIT)     // closes the allocation DoS (D14)
pieceLimitsOverrideSchema = Struct({ influence?, religion?, controlChits?, units?, production?,
  population?, tradePosts?, supplyLines?, railroads?, ports?, ships?, merchantShips?, navalShips? })
  // each optional pieceLimitSchema; unknown keys REJECTED via strict nested decode (D26)
  // resolved ship caps re-validated: each type <= total, sum >= total (D56)

setupOptionsSchema = Struct({
  ...generationFields,                    // seed/target/noisePoolFraction/seedRingDist/growthCap
  strategy = DEFAULT_STRATEGY,
  pieceLimits: opt(pieceLimitsOverrideSchema),
  nationNames: opt(Array(String)),
  catalogVersion: opt(String),
}).check(generationCrossFieldIssues)       // growthCap >= seedRingDist + 2 (D14/D30)

ResolvedSetupOptions = Omit<ResolvedGenerateCoordsOpts, "playerCount"> & {
  pieceLimits: PieceLimits; nationNames: ReadonlyArray<string>; catalogVersion: string | undefined
}
decodeSetupOptions(data) -> Result<ResolvedSetupOptions, SetupOptionsError>   // total, never throws
  // limits merge without a cast; unknown top-level keys still ignored
formatSetupError(err) -> string
```

## BoardGeneration.ts — generation options

```ts
strategySchema = Literals(["lattice","frontier"])

generateCoordsOpts = Struct({
  playerCount: Number, strategy: strategySchema,
  seed: Number = 0,
  target: Int >= 1 = 7,                    // D15
  noisePoolFraction: Number in [0,1] = 0.35,
  seedRingDist: Int >= 1 = 2,
  growthCap: Int >= 1 = 4,
}).check(makeFilter(generationCrossFieldIssues))   // growthCap >= seedRingDist + 2 (D14)
  type GenerateCoordsOpts / ResolvedGenerateCoordsOpts

GenerateCoordsError = InvalidOptions | InvalidPlayerCount | InsufficientRoom
STRATEGIES = { lattice: Lattice, frontier: Frontier }
generateCoords(opts) -> Result<Array<Array<Coords>>, GenerateCoordsError>
neutralCoords(nations) -> Array<Coords>
```

## Terrain.ts — configurable terrain (D21/D23/D33)

```ts
nationTerrainSchema = Struct({
  id: NonEmptyString, name: String,
  population: Int >= 0, populationText: String,
  movement: Int >= 0, movementText: String,
  assetId: String,
  tileCount: Int >= 1,                     // draw-pool size
  buildableProduction: Array(productionIdSchema),    // ids linted against the production catalogue (D53)
  maxProduction: Int >= 0,                 // max produced pieces per tile (D53)
  maxTierTwoProduction: Int >= 0,          // max Tier-II pieces per tile; filter: <= maxProduction (D53)
})  type NationTerrain

BORDER_TERRAIN_IDS = ["sea"] as const;  borderTerrainIdsSchema = Literals(BORDER_TERRAIN_IDS)
borderTerrainSchema = Struct({ id: borderTerrainIdsSchema, name, population, populationText, movement, movementText, assetId, tileCount: Int >= 0 })
allTerrainSchema = Union([nationTerrainSchema, borderTerrainSchema])   type Terrain

nationTerrainIdsSchema(table) / allTerrainIdsSchema(table) -> Literals factory   // ids are configurable

DEFAULT_NATION_TERRAIN (placeholder values), DEFAULT_BORDER_TERRAIN

interface TerrainTable { nation; border; byId: HashMap; nationIds/allIds: HashSet; pin: {version,hash} }
makeTerrainTable(nation, border, version?) -> Result<TerrainTable, TerrainTableError>
terrainById, hasTerrain, terrainPopulation, terrainMovement, terrainPoolSize

nationTerrainConfig: Config<ReadonlyArray<NationTerrain>>   // Config.schema(..., "terrain") + default
class TerrainCatalog extends Context.Service<TerrainCatalog, TerrainTable>
TerrainCatalogFromConfig -> Layer   // reads Effect Config; requires ConfigProvider
TerrainCatalogFixture(table) -> Layer
DEFAULT_TERRAIN_TABLE, terrainTableFromNation(nation)
```

## Resources.ts — resource & production catalogues (D52/D53)

```ts
resourceTierSchema = Literals([1, 2])                     type ResourceTier
resourceSchema = Struct({ id: NonEmptyString, name: String, tier: resourceTierSchema })
resourceAmountSchema = Struct({ resourceId: NonEmptyString, amount: Int > 0 })
productionIdSchema = NonEmptyString                       type ProductionId

productionSchema = Struct({
  id: NonEmptyString, name: String, tier: resourceTierSchema,
  resourceCost: Array(resourceAmountSchema),
  resourceProduced: Array(Array(resourceAmountSchema).minLength(1)).minLength(1),
  // >1 inner array = choose one output set per turn
})

DEFAULT_RESOURCES / DEFAULT_PRODUCTION                     // placeholders
resourcesConfig / productionConfig: Config<...>            // keys `resources` / `production`

ResourceLintIssue = { path, message }
lintProduction(resources, production) -> Result<{resources, production}, ResourceLintIssue[]>
lintTerrainProduction(terrain: TerrainTable, table: ProductionTable) -> Result<void, ResourceLintIssue[]>

ProductionPin = { version, hash }
ProductionTable = { resources; production; resourceById; productionById; resourceIds; productionIds; pin }
makeProductionTable(resources, production, version?) -> Result<ProductionTable, ProductionTableError>
resourceById / productionById / hasProduction / productionIdsSchema(table)
buildableProduction(terrain, table, terrainId) -> Production[]     // derived
tileResources(terrain, table, terrainId)     -> Resource[]         // derived, no per-tile field

class ProductionCatalog extends Context.Service<ProductionCatalog, ProductionTable>
ProductionCatalogFromConfig -> Layer           // Effect Config; requires ConfigProvider
ProductionCatalogFixture(table) -> Layer
DEFAULT_PRODUCTION_TABLE, DEFAULT_PRODUCTION_KIND
```

## Defense.ts — defense-structure catalogue (D54)

```ts
defenseStructureSchema = Struct({
  id: NonEmptyString, name: String,
  resourceCost: Array(resourceAmountSchema), defensePoints: Int >= 0,
  cap: Int >= 0,                                 // per-nation cap for this type
})
DEFAULT_DEFENSE_STRUCTURES                        // placeholders
defenseStructuresConfig: Config<...>              // key `defenseStructures`

lintDefense(types, production) -> Result<types, ResourceLintIssue[]>
DefenseTable = { types; byId; ids; pin }
makeDefenseTable(types, production, version?) -> Result<DefenseTable, DefenseTableError>
defenseStructureById / hasDefenseStructure / defenseSupplySpec(table) -> {id, cap}[]
class DefenseCatalog extends Context.Service<DefenseCatalog, DefenseTable>
DefenseCatalogFromConfig -> Layer                 // requires ProductionCatalog
DefenseCatalogFixture(table) -> Layer; DEFAULT_DEFENSE_TABLE
```

## Edges.ts — hex-edge geometry (D55)

```ts
EDGE_COUNT = 6
edgeIndexSchema = Int in [0, 5]
edgeSchema = Struct({ tile: coordsSchema, edge: edgeIndexSchema })   type Edge
coordsKey(coords) -> string
neighborOfEdge(edge) -> Coords
borderingTiles(edge) -> readonly [Coords, Coords]
edgeKey(edge) -> string        // canonical: independent of which side it is encoded from
sameEdge(a, b) -> boolean
edgeIndexBetween(from, to) -> Option<EdgeIndex>
canonicalEdge(a, b) -> Option<Edge>      // None unless a/b adjacent; anchored at smaller tile key
borderingBoardTiles(edge, tiles) -> [Option<Tile>, Option<Tile>]
isPortEdge(edge, tiles) -> boolean        // land <-> sea
```

## Random.ts / ContentHash.ts / View.ts / Reactions.ts (new modules)

```ts
// Random.ts
nextRandom(seed) -> [value, nextSeed]                  // mulberry32
shuffle(items, seed) -> [shuffled, nextSeed]
weightedDraw(items, weightOf, count, seed) -> { picked; nextSeed }
nationSeed(seed, nationId)

// ContentHash.ts
structuralHash(value) -> string                        // key-order independent

// View.ts (D11)
colorForPlayerId(state, playerID) -> Color | null
redactForViewer(state, viewer) -> State                // empties hand/deck/mandates/mat.cards for non-owners

// Reactions.ts (D13)
type MovesRegistry = Record<string, MoveDefinition<any>>
reactionBindings(nation, catalog) -> ReadonlyArray<ActionBinding>
categoryForPhase(phase) -> "react" | "trigger"
respondsToEvent(def, event, phase) -> boolean
canReact(nation, catalog, event, phase, moves?) -> boolean
eligibleReactors(state, catalog, event, phase, moves?) -> ReadonlyArray<Color>   // target first
openWindow(state, catalog, event, phase, moves?) -> Option<PendingReactions>
declare(window, actor, move, params, seq, moves?) -> Result<PendingReactions, ReactionError>
pass(window, actor) -> Result<PendingReactions, ReactionError>
isComplete(window) -> boolean
orderedDeclarations(window) -> ReadonlyArray<ReactionDeclaration>
resolveInterrupt(state, window, moves?) -> { state; event; vetoed }
resolveTrigger(state, window, moves?) -> State         // terminal
applyEvent(state, event, moves?) -> State
logEvent(state, event) -> State
```

## Game.ts — the boardgame.io assembly

```ts
class Service extends Context.Service<Service, {
  make(config: State.Config) -> Game<State.StateEncoded, {}, Setup.SetupOptions>
}>

ServiceLive : Layer   // requires CardCatalog + TerrainCatalog + ProductionCatalog + DefenseCatalog
  // cross-lints terrain.buildableProduction against the production catalogue at construction (D52/D53)
ServiceDev  : Layer   // empty catalog + default terrain/resources/production/defense
makeDevGame(config) -> Game   // convenience for tests

buildMoves(moves, catalog) -> MoveMap<State.StateEncoded, {}>   // game moves + system moves
buildSystemMoves(catalog, moves) -> { declareReaction, passReaction }

// What `make` returns:
{
  name, minPlayers, maxPlayers,
  validateSetupData(data) -> string | undefined,
  setup({ctx}, data) -> StateEncoded,
     // generate board -> weighted terrain draw (D23) -> tiles -> nations with the
     // configurable supplies (production kind, defense caps, ships) + embassies -> State.encode
  moves: buildMoves(MOVES, catalog),
     // per move: decode G -> decode params -> canApply -> propose event -> interrupt window
     // (suspend or apply) -> log event -> trigger window. INVALID_MOVE on failure (D35/D40/D48).
  phases: { action: { start: true } },
  turn: { minMoves: 0, maxMoves: 1, onEnd: clears playArea },   // D37/D38
  endIf: () => undefined,                                       // seam only (D39)
  playerView({G, playerID}) -> decode -> redact -> encode,      // D11/D40
}
```

No `State.turn` / `State.phase`; `ctx` is the single source of truth for turn/phase (D12).

---

## Cross-cutting observations

**Boundary encoding (D40).** `G` is stored in its `StateEncoded` form because boardgame.io's
serializability plugin rejects any non-plain object and Effect `Option` is a class instance. The
engine works with the decoded `State` form; `setup`, moves and `playerView` convert at the
boundary. Everything else in this package is `Option`-based rather than `undefined`-based (D20).

**Narrowing.** `units.kind`, `influence.face`, `religion.face`, `ships.kind`, `mat.slots[].chit`,
`gameEvent.categories`, `gameEvent.tags` and `respondsTo` are literal unions. `production.kind`,
`defenseStructures.kind`, `chit.subtype`, `card.domains`, `card.domain` and `terrain` remain validated
strings (lint / catalogue lookup; the id sets are configurable).

**Cross-references are lint + HashSet.** `actionBinding.move`, `check.predicate`, card domains,
chit domain/subtype, `categoryDomains` are validated by `lintCatalog`, which now also decodes
`params`/`check.params` against the referenced schema (D4) and uses `HashSet` membership so
`Object.prototype` keys cannot pass (D16).

**No invariant enforced for:** `cubeSchema`'s `q+r+s===0`, board tile-coordinate uniqueness, and the
"supply arrays are never resized" discipline (documented, tested indirectly). Nation-piece `kind`
fields (`production.kind`, `defenseStructures.kind`) are valid **by construction** in `makeNation`
(from the catalogues); there is no per-nation re-lint.

**Still deferred:** game-end trigger (`endIf` inert, D39); the move set and tag vocabulary (D42/D44);
reaction stage mirroring (D50); catalog content + admin-portal UI (D51); a real reaction-effect
vocabulary beyond veto/event replacement; supply-line **turn-based upkeep** rules (cost encoded, D57);
**port ship capacity / docking** rules (deferred, §8.7); production **tier consistency** (Tier-II
production costing only Tier-I resources) is content guidance, not lint-enforced.
