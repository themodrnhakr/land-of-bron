# Land of Bron — Current Schema Inventory

Snapshot of every Effect `Schema` in `packages/game/src`, as of the Phase 0 test harness.
Reference for Phase 1 (schema gap analysis) and Phase 2 (schema cleanup).
Scratch document — delete when it stops being useful.

Legend: `opt` = `Schema.optional(...)` · `= X` = decoding default · ⚠ = noted irregularity

---

## Coords.ts — hex primitives

```ts
coordsSchema = Struct({ q: Number, r: Number })
  type Coords = { q: number; r: number }

cubeSchema = Struct({ q: Number, r: Number, s: Number })
  type Cube = { q: number; r: number; s: number }
  ⚠ invariant q + r + s === 0 is documented but NOT enforced by the schema

Constants:  ORIGIN = { q: 0, r: 0 }
            DIRECTIONS = 6 axial unit vectors
Functions:  toCube(coords) -> Cube
            fromCube(cube) -> Coords
            hexDistance(a, b) -> number
            add(a, b) -> Coords
```

## Tile.ts — geography + control

```ts
landTerrainSchema = Literals(["plains", "forest", "mountain", "desert"])
terrainNameSchema = Union([landTerrainSchema, Literal("sea")])
  type TerrainName = "plains" | "forest" | "mountain" | "desert" | "sea"

tileSchema = Struct({
  coords:  coordsSchema,
  terrain: terrainNameSchema,
  color:   opt(colorSchema),     // home nation; absent on sea tiles
  control: opt(colorSchema),     // current controller
})
  type Tile

fromCoords(coords, color | undefined, terrain) -> Tile   // sets control = color
```

## Nation.ts — the player seat

```ts
colorSchema = Literals(["red", "orange", "yellow", "green", "blue", "indigo", "violet"])
  type Color

matSchema = Struct({
  cards: Array(String),                    // ⚠ comment says "3 card slots"; array is unbounded
  slots: Array(Struct({
    domain: String,                        // domain id
    chit:   opt(String),                   // chit id
  })),
})
  type Mat

chitSchema = Struct({
  id:          String,
  domain:      String,                     // domain id      (lint-checked only)
  subtype:     String,                     // mandate row    (lint-checked only)
  description: String,
  powers:      Array(actionBindingSchema),
})
  type Chit

nationSchema = Struct({
  color: colorSchema,
  name:  String,

  // --- off-board zones (card ids) ---
  hand:     Array(String),
  deck:     Array(String),
  discard:  Array(String),
  playArea: Array(String),
  mandates: Array(String),
  mat:      matSchema,
  score:    Number,                        // bonus VP only; mandate VP is derived

  // --- limited pieces: array length IS the supply cap ---
  influence:   Array(Struct({ face: influenceFaces, at: opt(coordsSchema) })),
  religion:    Array(Struct({ face: religionFaces,  at: opt(coordsSchema) })),
  controlChits:Array(Struct({ at: opt(coordsSchema) })),
  units:       Array(Struct({ kind: unitKinds,      at: opt(coordsSchema) })),
  production:  Array(Struct({ kind: String,         at: opt(coordsSchema) })),  // ⚠ kind NOT narrowed
  population:  Array(Struct({ at: opt(coordsSchema) })),                        // ⚠ no distinguishing field
  tradePosts:  Array(Struct({ at: opt(coordsSchema) })),

  // --- unique pieces ---
  embassy: opt(coordsSchema),
  capital: opt(coordsSchema),
})
  type Nation

makeNation(color, name, limits = PIECE_LIMITS) -> Nation
```

## Pieces.ts — piece faces, supply caps, placement helpers

```ts
influenceFaces = Literals(["influence", "goodwill"])
religionFaces  = Literals(["prosletized", "converted"])   // ⚠ typo: should be "proselytized"
unitKinds      = Literals(["army", "missionary"])

PIECE_LIMITS = {
  influence: 8, religion: 6, controlChits: 4, units: 8,
  production: 6, population: 6, tradePosts: 3,
} as const
  type PieceLimits = typeof PIECE_LIMITS
  ⚠ literal-typed: `PieceLimits["influence"]` is `8`, so any override is a type lie

type PlacedPiece<A> = A & { readonly at?: Coords }

makeSupply(count, data) -> PlacedPiece<A>[]      // full supply in the pool
place(piece, at) -> P                            // immutable placement
returnToPool(piece) -> P                         // immutable return
poolCount(pieces) -> number
onBoardCount(pieces) -> number
```

## Moves.ts — the behaviour registries

```ts
MOVE_CATEGORY_IDS = ["action", "react", "trigger", "passive"]
  type MoveCategoryId

actionBindingSchema = Struct({
  move:     String,                        // key into MOVES      (lint-checked only)
  optional: opt(Boolean),                  // player may skip
  params:   opt(Record(String, Unknown)),  // static args, ⚠ never decoded against the move's params
})
  type ActionBinding

// Interfaces (no schema; these are the code-side contract)
type MoveError      = { _tag: "Unimplemented"; move } | { _tag: "Illegal"; reason }
interface MoveContext   { state: State; actor: Color; turn: number }
interface MoveOutcome   { state: State }
interface MoveDefinition<P> {
  categories: ReadonlyArray<MoveCategoryId>
  respondsTo?: ReadonlyArray<MoveCategoryId>
  params: Schema.Schema<P>
  canApply: (ctx: MoveContext, p: P) => Result<boolean, MoveError>
  apply:    (ctx: MoveContext, p: P) => Result<MoveOutcome, MoveError>
}
interface CheckDefinition<P> {
  params: Schema.Schema<P>
  check: (state: State, p: P) => boolean
}

MOVES: { pass: MoveDefinition<{}>, counterAttack: MoveDefinition<{ at: Coords }> }
  type MoveId = keyof typeof MOVES
CHECKS: Record<string, CheckDefinition<unknown>> = { always }
```

## Cards.ts — the catalog

```ts
// internal, spread into both card kinds:
cardBase = Struct({
  id:             String,
  name:           String,
  domains:        Array(String),           // authored; domain ids (lint-checked only)
  body:           String,                  // prose, not behaviour
  age:            Number,
  minimumPlayers: Number,                  // tier
})

regularCardSchema = Struct({
  ...cardBase,
  kind:    Literal("regular"),
  actions: Array(actionBindingSchema),
})
  type RegularCard

mandateRowSchema = Struct({
  subtype:     String,                     // must belong to one of the card's domains (lint)
  description: String,
  check: Struct({
    mode:      Literals(["endOfGame", "event"]),   // ⚠ unused by the engine; D6 proposes deleting
    predicate: String,                             // key into CHECKS (lint-checked only)
    params:    opt(Record(String, Unknown)),       // ⚠ never decoded against the check's params
  }),
})
  type MandateRow

mandateCardSchema = Struct({
  ...cardBase,
  kind:     Literal("mandate"),
  vp:       Number,
  mandates: Array(mandateRowSchema),
})
  type MandateCard

cardSchema = Union([regularCardSchema, mandateCardSchema])
  type Card

domainSchema = Struct({
  id:       String,
  label:    opt(String),
  subtypes: Array(Struct({ id: String, label: opt(String) })),
})
  type Domain

catalogSchema = Struct({
  version:         String,
  domains:         Array(domainSchema),
  categoryDomains: Record(String, Array(String)),   // move category -> domain ids
  cards:           Array(cardSchema),
  chits:           Array(chitSchema),
})
  type Catalog

emptyCatalog: Catalog

cardById(catalog, id) -> Option<Card>
chitById(catalog, id) -> Option<Chit>

type LintIssue = { path: string; message: string }
lintCatalog(catalog)      -> Result<Catalog, ReadonlyArray<LintIssue>>
contentHash(catalog)      -> string            // deterministic, key-order independent

type CatalogError = { _tag: "InvalidJson" } | { _tag: "InvalidCatalog" } | { _tag: "LintFailed" }
decodeCatalogJson(json)   -> Result<Catalog, CatalogError>       // parse -> decode -> lint

class CardCatalog extends Context.Service<CardCatalog, {
  catalog: Catalog; version: string; hash: string
  card: (id) => Option<Card>; chit: (id) => Option<Chit>
}>
CardCatalogFromJson(json)   -> Layer
CardCatalogFixture(catalog) -> Layer
```

## State.ts — the `G` shape

```ts
class Config extends Schema.TaggedClass("State/Config", {
  name: String, minPlayers: Number, maxPlayers: Number,
})
  ⚠ defined but referenced nowhere

phaseSchema = Literals(["action"])          // only one phase exists
  type Phase

gameEventSchema = Struct({
  seq:        Number,
  move:       String,                       // registry key
  categories: Array(String),                // ⚠ NOT narrowed to MoveCategoryId
  actor:      colorSchema,
  at:         opt(coordsSchema),
  params:     Record(String, Unknown),
  turn:       Number,
})
  type GameEvent

catalogPinSchema = Struct({ version: String, hash: String })
  type CatalogPin

class State extends Schema.TaggedClass("State", {
  tiles:   Array(tileSchema),               // flat; no index, no uniqueness guarantee
  nations: Array(nationSchema),             // indexed by playerID
  turn:    Number,                          // ⚠ duplicates ctx.currentPlayer
  phase:   phaseSchema,                     // ⚠ duplicates ctx.phase
  events:  Array(gameEventSchema),
  catalog: catalogPinSchema,                // pins the match to a catalog version+hash
})

make(tiles, nations, catalog) -> State       // turn 0, phase "action", events []
```

## Setup.ts — per-match configuration (`setupData`)

```ts
DEFAULT_NATION_NAMES   = 7 names ("Red Empire", ...)
DEFAULT_LAND_TERRAIN   = "plains"
DEFAULT_STRATEGY       = "frontier"

pieceLimitsOverrideSchema = Struct({
  influence: opt(Number), religion: opt(Number), controlChits: opt(Number),
  units: opt(Number), production: opt(Number), population: opt(Number), tradePosts: opt(Number),
})
  ⚠ accepts zero and negatives; unknown keys silently stripped, not rejected

setupOptionsSchema = Struct({
  // spread of generateCoordsOpts minus playerCount and strategy:
  seed:             Number = 0
  target:           Number = 7        ⚠ no lower bound
  noisePoolFraction:Number = 0.35     ⚠ no [0,1] bound
  seedRingDist:     Number = 2        ⚠ no lower bound / no cross-check vs growthCap
  growthCap:        Number = 4
  strategy:         strategySchema = "frontier"
  terrain:          opt(landTerrainSchema)
  pieceLimits:      opt(pieceLimitsOverrideSchema)
  nationNames:      opt(Array(String))
  catalogVersion:   opt(String)
})
  type SetupOptions = Encoded (sparse; what clients send)

type ResolvedSetupOptions = Omit<ResolvedGenerateCoordsOpts, "playerCount"> & {
  terrain: LandTerrain
  pieceLimits: PieceLimits            // ⚠ `as PieceLimits` cast in decodeSetupOptions is load-bearing
  nationNames: ReadonlyArray<string>
  catalogVersion: string | undefined
}

type SetupOptionsError = { _tag: "InvalidSetupOptions"; error: SchemaError }
decodeSetupOptions(data) -> Result<ResolvedSetupOptions, SetupOptionsError>   // total, never throws
formatSetupError(err) -> string
```

## BoardGeneration.ts — generation options

```ts
strategySchema = Literals(["lattice", "frontier"])
  type Strategy

generateCoordsOpts = Struct({
  playerCount:      Number,                 // required; range-checked in code, [2, 7]
  strategy:         strategySchema,         // required
  seed:             Number = 0
  target:           Number = 7              // ⚠ no lower bound -> target<1 gives 1-tile nations
  noisePoolFraction:Number = 0.35           // ⚠ no [0,1] bound
  seedRingDist:     Number = 2              // ⚠ no lower bound
  growthCap:        Number = 4              // ⚠ no cross-field check vs seedRingDist
})
  type GenerateCoordsOpts          = Encoded (defaults optional)
  type ResolvedGenerateCoordsOpts  = Type    (every field present)

type GenerateCoordsError =
  | { _tag: "InvalidOptions";      error: SchemaError }
  | { _tag: "InvalidPlayerCount";  playerCount: number }
  | { _tag: "InsufficientRoom";    nationId, actual, target, playerCount, growthCap, seedRingDist }

STRATEGIES = { lattice: Lattice, frontier: Frontier }
generateCoords(opts)  -> Result<Array<Array<Coords>>, GenerateCoordsError>
neutralCoords(nations)-> Array<Coords>        // sea = neighbours of land, minus land
```

## Game.ts — the boardgame.io assembly

```ts
class Service extends Context.Service<Service, {
  make: (config: State.Config) => Game<State, {}, Setup.SetupOptions>
}>

ServiceLive : Layer   // requires CardCatalog
ServiceDev  : Layer   // provided with Cards.emptyCatalog

// What `make` currently returns on the boardgame.io Game object:
{
  name, minPlayers, maxPlayers,
  validateSetupData: (data) => string | undefined,   // wraps decodeSetupOptions
  setup: ({ ctx }, data) => State,                   // generates board + tiles + nations
}
// ⚠ and nothing else: no moves, no turn, no phases, no endIf, no playerView
```

---

## Cross-cutting observations

**Narrowing is inconsistent.** `units.kind` and `influence.face` are literal unions; `production.kind`,
`gameEvent.categories`, and `chit.subtype` are bare `String`. `population` has no distinguishing
field at all.

**Everything cross-referential is lint-only.** `actionBinding.move`, `check.predicate`,
`card.domains`, `chit.domain`, `chit.subtype`, `categoryDomains` — all validated by `lintCatalog`
and by nothing else. And `lintCatalog` currently uses the `in` operator, so `Object.prototype`
members pass (see PLAN.md findings A/B/C).

**No invariant is enforced anywhere.** `cubeSchema`'s `q+r+s===0`, `mat.cards` having 3 slots,
territory disjointness, `Tile.color` matching some nation's `color`, `tiles` having no duplicate
coords, `pieceLimits` agreeing with the actual inventory lengths — all are conventions.

**Two sources of truth.** `State.turn`/`State.phase` vs `ctx.currentPlayer`/`ctx.phase`;
`State.events[].turn` vs both; mandate VP derived in `Scoring` vs `Nation.score`. (D12.)

**No hidden information.** `hand`, `deck`, and `mandates` sit in the shared `G`. (D11.)

**Unused.** `State.Config`; `MandateRow.check.mode`; `generateCoordsOpts`'s `target`,
`noisePoolFraction`, `seedRingDist`, `growthCap` under the `lattice` strategy.
