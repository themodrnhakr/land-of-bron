# Land of Bron — Core Game Package Plan

Working document for the `packages/game` effort. Written to be handed to a fresh agent.
It is a scratch plan, not permanent documentation — move or delete it when it stops being useful.

**Companion doc:** `SCHEMA.md` — a complete inventory of every current Effect schema, with the
irregularities annotated. Read it alongside Phase 1.

**Status.** Phases 0–6 **complete**; **Phase 7 (§8) implemented** (221 tests, `tsc` clean). Phases 2–6 were executed in one run
with the per-gate stop waived; every autonomous decision is recorded in the decision log (D24–D66)
and listed in the run report. Two pieces are deliberately deferred to the user: the **move set**
(and its tag vocabulary) and the **game-end trigger**; the **catalog content** and **admin portal**
remain the medium-term goal (Phase 6).

---

## 0. Context

**The project.** A hex-based board game. `boardgame.io` is the game framework, `Effect.ts` (v4
beta) is used heavily, and the web app is SvelteKit (Svelte 5, runes forced on) with Bun as the
package manager and runtime.

**Repo layout.**

| Path              | What it is                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `packages/game`   | The rules engine + data model. **This is the focus.**                                        |
| `packages/server` | Stub — `console.log("test")`. Out of scope for now.                                          |
| `apps/web`        | SvelteKit app. Currently only a hex-map layout explorer, not the game. Out of scope for now. |

**Goal, short term.** Get the core `packages/game` package squared away.
**Goal, medium term.** A playable game, plus a web admin portal for tweaking settings and adding cards.

**The agreed arc.** (a) get the schema set up → (b) start assembling the boardgame.io game object →
(c) add all the moves that are necessary.

**Working style — read this carefully.** Go _slow_. This is explicitly not a one-shot. Each phase
below ends in a **GATE** where you stop, report what you did and what you found, and wait for the
user's answer. Do not run ahead into the next phase. Do not batch phases. Do not make design
decisions that are listed as OPEN — ask. The user is guiding this step by step and has design
documents they will feed you piecemeal; you are not expected to reverse-engineer the ruleset.

---

## 1. Ground rules

**Do not touch:**

- `apps/web/src/lib/ui/HexGridDemo.svelte` and `HexGrid.svelte` — an exploratory demo, intentionally
  not maintained. Its `svelte-check` errors are known and ignored.
- `packages/server` — the server comes later.
- The `effect` version in any `package.json`. The user is managing a version-skew problem
  (`packages/server` is on `4.0.0-beta.102`, everything else on `4.0.0-beta.107`); do not
  "fix" it.

**Conventions:**

- Effect v4 idioms: return `Result`/`Option` instead of throwing or returning `undefined`; use
  `Array.findFirst` (returns `Option`) rather than `find(...) === undefined ? none : some`; chain
  with `pipe` + `Option.flatMap`; use `HashMap`/`HashSet` for lookups and set membership.
- Schemas: validate at the boundary, then operate on a structure where invalid states are
  unrepresentable. Prefer narrowing to types over runtime checks.
- Tests are colocated as `*.test.ts` and run with `bun test`.
- Format with `dprint` (`bun run fmt`).

**Verification commands:**

```bash
cd packages/game && ../../node_modules/.bin/tsc --noEmit -p tsconfig.json   # typecheck (currently clean)
bun test packages/game                                                      # tests (need to add script)
bun run fmt:check
```

**Version control:** the repo has both `.git` and `.jj` (Jujutsu colocated with git). Confirm with
the user what they want before committing anything.

---

## 2. Current state (audit)

**Built and solid.** `packages/game` type-checks clean and contains a genuinely good data model:

- `Coords.ts` — axial/cube hex math, `DIRECTIONS`, `hexDistance`, `add`.
- `BoardGeneration.ts` + `BoardGenerationStrategies.ts` — two deterministic generators (`lattice`,
  `frontier`) behind a registry, returning `Result` with typed errors (`InvalidOptions`,
  `InvalidPlayerCount`, `InsufficientRoom`), plus `neutralCoords` for the sea ring.
- `State.ts` — the `G` shape: `tiles`, `nations`, `turn`, `phase`, `events`, `catalog` pin.
- `Tile.ts`, `Nation.ts`, `Pieces.ts` — tile geography/control; nations as player seats with
  inventories where the array length _is_ the supply cap.
- `Cards.ts` — domain/subtype vocabulary, `regular` vs `mandate` cards, chits, `lintCatalog`,
  `contentHash`, and a `CardCatalog` Effect `Context.Service` with JSON decoding.
- `Moves.ts` — the `MoveDefinition` contract (`params` Schema, `canApply`, `apply` → `Result`),
  move categories, `respondsTo`, and the `MOVES` / `CHECKS` registries.
- `Scoring.ts` — `applicableMandate`, `mandateFulfilled`, `victoryPoints` (pure selectors).
- `Setup.ts` — `setupData` decoding with defaults and typed errors.
- `Game.ts` — `ServiceLive`, an Effect service that assembles a boardgame.io `Game` config from a
  `CardCatalog`.

**Not built.**

- The boardgame.io `Game` object has no `moves`, `turn`, `phases`, or `endIf`. `MOVES` is never
  bridged into `game.moves`, and `state.events` is never appended to.
- `MOVES` contains only no-op stubs (`pass`, `counterAttack`); `CHECKS` only `always`.
- Zero card content — `emptyCatalog` is the only catalog and `CardCatalogFromJson` is never called.
- Zero tests.
- No reaction mechanism, no hidden-information redaction, no win condition wiring.

**Known and ignored:** `svelte-check` reports 14 TS errors + 2 CSS warnings, all confined to the
throwaway demos in `apps/web`.

---

## 3. Decision log

Status legend: **SETTLED** (agreed, just do it) · **PROPOSED** (agreed in principle, confirm before
building) · **OPEN** (needs the user's input before any code).

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Status     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| D1  | Keep the "config references code" registry pattern (`ActionBinding` + `MOVES` + `lintCatalog`). Do not hardcode moves onto cards.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | SETTLED    |
| D2  | Prefer a small number of _generic_ moves parameterized by static config params over one-move-per-card.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | SETTLED    |
| D3  | Cards whose actions are all `optional` may legally be played as a no-op. Acceptable, even strategically.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | SETTLED    |
| D4  | Validate `binding.params` against `MOVES[move].params` at lint time (currently unchecked). Same for `check.params` against `CHECKS[predicate].params`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | SETTLED    |
| D5  | Chit acquisition is setup's purview. Deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | SETTLED    |
| D6  | Mandate check predicates stay pure functions of state. Delete `check.mode`. Expose one `mandateStatus` selector. **Note (D11):** mandates are win conditions but **do not end the game** — `mandateStatus` feeds the client (per-viewer) and end-of-game scoring, **not** `endIf`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | PROPOSED   |
| D7  | Mandate cards are single-domain. Encode that in the schema so `card.domains[0]` disappears.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | PROPOSED   |
| D8  | Normalize/index the catalog once at load (HashMaps in the `CardCatalog` service) so lookups are O(1) and total.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | PROPOSED   |
| D9  | Svelte client will be a hand-rolled Svelte 5 runes wrapper around the framework-agnostic `boardgame.io/client`. (Late phase.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | SETTLED    |
| D10 | Testing uses `bun test`, colocated `*.test.ts`. **Confirmed and implemented.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | SETTLED    |
| D11 | Hidden information. **Secret to opponents:** `hand`, `deck`, `mandates`, `mat.cards`. **Public:** `discard`, `playArea` (except special cases), `mat.slots[].chit`, `score`, all piece pools, `embassy`, `capital`. Adopt `playerView` now; redaction is a pure function of `(state, viewer)`. **Pragmatic policy:** if a zone can't be redacted without creating a mess, leave it public and mark it `// technically secret` in the schema so we know where to look later.                                                                                                                                                                                                                                                                                                                              | SETTLED    |
| D12 | Delete `State.turn` and `State.phase` from `G` — both duplicate boardgame.io `ctx` and nothing reads them. Keep `phaseSchema` as the phase-name vocabulary. `GameEvent.turn` (the historical record) and `MoveContext.turn` are separate fields and stay; the Phase 3 bridge populates both from `ctx`, with `turn` meaning the **turn counter** (`ctx.turn`). `MoveContext` gains a `phase` field in Phase 3 once phases exist.                                                                                                                                                                                                                                                                                                                                                                         | SETTLED    |
| D13 | The reaction model. See Phase 5. **All sub-questions settled.** Human intervention required → suspension via a **`pendingReactions` declaration queue in `G`** (boardgame.io stages are transport only). **Both** interrupt and triggered reactions exist, in **two windows** (pre-effect interrupt, then post-effect trigger). Reactions are **terminal** (no chaining / stack / loop guard). **Ordering:** within each window the **targeted** player resolves first, then others in **declaration order**; all eligible players are **prompted simultaneously** and a declaration is **public immediately**; **events may have no target**. **Q4 = tags:** moves carry named **tags** (a code-side vocabulary, _not_ move categories); `respondsTo` references tags; the list is authored in Phase 4. | SETTLED    |
| D14 | Add range and cross-field validation to all generation/setup numeric options: `target >= 1`, `noisePoolFraction` in `[0,1]`, `seedRingDist >= 1`, `growthCap >= seedRingDist + 2`, and piece-limit caps as integers ≥ 1 with a sane upper bound (closes the allocation DoS). Widen `PieceLimits` to `Record<keyof typeof PIECE_LIMITS, number>` so the `as PieceLimits` cast can go. Decide whether unknown `pieceLimits` keys are rejected rather than stripped.                                                                                                                                                                                                                                                                                                                                        | PROPOSED   |
| D15 | Validate `target >= 1`. A board with `target < 1` is never legitimate (it silently yields 1-tile nations).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | SETTLED    |
| D16 | Fix the prototype-chain hole in `lintCatalog` (`in` → `Object.hasOwn` / id `HashSet`) and harden `mandateFulfilled` so a malformed predicate returns `false` instead of throwing. Fold into Phase 2 item 7.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | SETTLED    |
| D17 | Keep the Phase 0 `KNOWN BUG` / `KNOWN GAP` tests as real, failing-on-fix tests, each naming the Phase 2 item that flips it — rather than `test.todo`/skipped.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | SETTLED    |
| D18 | Add `Pieces` supply-helper tests (`place`/`returnToPool`/`poolCount`/`onBoardCount`) to the Phase 0 net. Defer `Game.ServiceLive` setup coverage to Phase 3, where it belongs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | PROPOSED   |
| D19 | Normalize `Tile.control`: `color` is **immutable** and every land tile always has one (there is no uncontrolled-land state; annexation = a captured capital, deferred, and never re-homes a tile). Store **only the override** — `control` becomes `Option<Color>` where `None` means "the home colour controls it" — so `fromCoords` writes `control: None`, never `control: color`. The effective controller is a single derived accessor (`control` else `color`); nothing reads raw `.control`.                                                                                                                                                                                                                                                                                                      | SETTLED    |
| D20 | Convert genuinely-optional fields from `Schema.optional` (`T \| undefined`) to a real `Option<T>`, matching the package's `Option`-not-`undefined` idiom. **Encoder: `Schema.OptionFromOptional`** (absent JSON key ↔ `None`; a wire-form-preserving drop-in for `Schema.optional`), _not_ `Schema.Option` (which encodes `{_tag:"Some",value}`), so hand-authored catalog JSON and `contentHash` stay unaffected. **Excludes** fields whose absence means "use the default" — those gain a decoding default instead: `actionBinding.optional` → `false`, and `actionBinding.params` / `mandateRow.check.params` → `{}`.                                                                                                                                                                                 | SETTLED    |
| D21 | Terrain model (USER_NOTES §7.1). Rename to `nationTerrainIdsSchema`/`nationTerrainSchema`, `borderTerrainIdsSchema`/`borderTerrainSchema`, `allTerrainIdsSchema`/`allTerrainSchema`. Terrain types + attributes (tile name, population, population display text, movement, movement display text, asset id, **tile count**) are configurable, injected via **Effect `Config`** at **game level** (not per-match). `Tile.terrain` becomes a validated **id string** (the literal union is gone). Attributes are **normalized** in a terrain table keyed by id, **pinned in `State`** like the catalog, and **linted** against the `*Ids` schemas. `population`/`movement` are read by the engine. Per-match `terrain` option + `DEFAULT_LAND_TERRAIN` removed.                                            | SETTLED    |
| D22 | Embassy (USER_NOTES §7.2): one entry per _other_ nation, storing **only the host nation id** (no coords — the location is derived from the host's `capital`); at most one embassy per host colour, so `playerCount - 1` entries. `makeNation` gains the player count / other colours.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | SETTLED    |
| D23 | Terrain selection (USER_NOTES §7.3): `target` stays an **independent** variable; terrain **tile counts** form a **weighted pool whose sum exceeds `target`**; **each nation draws independently** from its own pool (per nation; no cross-nation uniqueness constraint), **without replacement**, and places the tiles randomly on its generated coords; sea (border terrain) is excluded; the draw is seeded for reproducibility.                                                                                                                                                                                                                                                                                                                                                                       | SETTLED    |
| D24 | `mat.cards` capacity. Keep the comment's "3 card slots" intent: add `MAX_MAT_CARDS = 3` and enforce it as **at most** 3 (`Schema.isMaxLength(3)`), so an over-full mat is unrepresentable while partial fills stay legal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | AUTONOMOUS |
| D25 | `State.Config` is **kept**. It is the `Service.make` game-identity config (name + seat range), so SCHEMA.md's "referenced nowhere" was stale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | AUTONOMOUS |
| D26 | `pieceLimits` (D14). Unknown keys are **rejected** (a strict nested decode with `onExcessProperty: "error"`, scoped so unknown _top-level_ keys stay ignored). Caps are integers in `[1, MAX_PIECE_LIMIT]` with `MAX_PIECE_LIMIT = 100` (comfortably above any real cap; closes the allocation DoS). The resolved limits are **not** recorded in `State` — the inventory array length remains the single source of truth, and "supplies are never resized" stays a documented discipline with tests.                                                                                                                                                                                                                                                                                                     | AUTONOMOUS |
| D27 | **SUPERSEDED by D52** — the production/resource model is configurable (see §8). Originally: narrow `production.kind` to `productionKinds = Literals(["farm"])` for consistency with `units.kind`. The vocabulary starts minimal and grows with content; no game content is invented.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | AUTONOMOUS |
| D28 | Tags vs categories (D13-Q4 / open question 11): keep **both axes**. `GameEvent.categories` narrows to `MoveCategoryId[]` (how a move is invoked); a new `tags: Tag[]` records what happened. `MoveDefinition` gains `tags` and `respondsTo: Tag[]`. `KNOWN_TAGS = ["action"]` — non-empty (a `Literals` union cannot be empty) and grows in Phase 4.                                                                                                                                                                                                                                                                                                                                                                                                                                                     | AUTONOMOUS |
| D29 | Terrain pin + seed (open question 12). The terrain table lives in a `TerrainCatalog` service; `State` gains its own `terrain: { version, hash }` pin (mirroring the catalog pin). The terrain draw is derived from the single match `seed` per nation (`nationSeed(seed, id)`), so one seed reproduces board **and** terrain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | AUTONOMOUS |
| D30 | Validation placement (D14). Per-field ranges live in the field schemas; the cross-field `growthCap >= seedRingDist + 2` rule is a struct-level `Schema.makeFilter` applied to **both** `generateCoordsOpts` and `setupOptionsSchema`. Both surface as `InvalidOptions`; the `playerCount` range check stays in code as a typed `InvalidPlayerCount`.                                                                                                                                                                                                                                                                                                                                                                                                                                                     | AUTONOMOUS |
| D31 | `GameEvent.target` is a single `Option<Color>`, not a list (open question 10). Multi-target events can gain a separate field later without changing this one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | AUTONOMOUS |
| D32 | Reaction declaration policy (Phase 5 detail, recorded early): **at most one declaration per player per window**; a window closes once every eligible player has declared or passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | AUTONOMOUS |
| D33 | Terrain schema shape (D21). `nationTerrainSchema` / `borderTerrainSchema` / `allTerrainSchema` are attribute structs. `nationTerrainIdsSchema(table)` and `allTerrainIdsSchema(table)` are **factories** (the nation id set is configurable, so it cannot be a static union); border ids are hardcoded `["sea"]`. The default table's numbers are **placeholders** — the shape and the config seam are the deliverable, not the content.                                                                                                                                                                                                                                                                                                                                                                 | AUTONOMOUS |
| D34 | Terrain selection mechanics (D23). A shared `Random.ts` mulberry32 PRNG drives `weightedDraw` (draw `target` ids by remaining `tileCount`, without replacement) then `shuffle` (assign to the nation's coords). Setup requires `terrainPoolSize >= target`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | AUTONOMOUS |
| D35 | boardgame.io 0.50's `LongFormMove` has **no `validateMove`** field (despite the plan's wording). Legality therefore lives inside the move body: param decoding and `canApply` run there, and `INVALID_MOVE` is returned on failure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | AUTONOMOUS |
| D36 | Event logging is a **wrapper in the move bridge**, not a boardgame.io plugin. Every successful move appends one `GameEvent` (`seq = events.length`), so `state.events` is complete by construction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | AUTONOMOUS |
| D37 | Turn/phase config: one `"action"` phase with `start: true`; `turn: { minMoves: 0, maxMoves: 1 }`. The concrete move counts are a Phase 4 rules question; 1 keeps turns moving and is testable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | AUTONOMOUS |
| D38 | The documented "played cards; cleared at end of turn" rule lives in `turn.onEnd` (operating on the encoded `G`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | AUTONOMOUS |
| D39 | `endIf` is present but **never ends the game** until the real trigger is supplied (open question 8). Mandates are deliberately not wired to it (D6/D11).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | AUTONOMOUS |
| D40 | **`G` is the encoded state.** boardgame.io's serializability plugin rejects any non-plain object, and Effect `Option` is a class instance, so the `Option`-based `Type` cannot live in `G`. `setup`, every move and `playerView` decode `G` into the typed `State` on the way in and `Schema.encode` back to plain JSON on the way out. `Service.make` returns `Game<State.StateEncoded, ...>`; the engine still operates on the typed `State`. (This resolves open question 7 — tagged `Option`s do **not** survive as-is.)                                                                                                                                                                                                                                                                             | AUTONOMOUS |
| D41 | Determinism (Phase 3 step 6): board generation and terrain selection both stay seeded from `setupData.seed`. boardgame.io's `random` plugin is left available to future moves but is **not** used by setup, so one seed reproduces the whole match.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | AUTONOMOUS |
| D42 | **Phase 4 move set is deferred to the user** (GATE 4 explicitly gated it on their enumeration, and inventing game rules is forbidden). Phase 4 delivers the move-authoring infrastructure instead: the `MoveDefinition` contract, the boardgame.io bridge, per-move unit tests, and the config-references-code test path. Only the existing structural placeholders (`pass`, `counterAttack`) are implemented.                                                                                                                                                                                                                                                                                                                                                                                           | AUTONOMOUS |
| D43 | `pass` is always legal. `counterAttack` (a placeholder) enforces only **structural** legality: its target cell must exist on the board. The real counter-attack rule is user-provided.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | AUTONOMOUS |
| D44 | The event-**tag** vocabulary is deferred beyond the structural `"action"` tag; real tags are authored together with the real moves. `respondsTo` is compile-time checked against `Tag`, so an unknown tag cannot be written.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | AUTONOMOUS |
| D45 | The "cards that need a move that does not exist yet" list is empty — there is no card content yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | AUTONOMOUS |
| D46 | Reaction eligibility is filtered by **category per window**: an interrupt window requires the move's `react` category, a trigger window requires its `trigger` category, **and** `respondsTo` must intersect the event's tags. This is the concrete use of the structural `categories` axis alongside tags (D28).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | AUTONOMOUS |
| D47 | `State.pendingReactions` is `Option<PendingReactions>` holding the in-flight event, the phase, the eligible reactors in resolution order, the public declarations, and who has passed. `None` = no window, no suspension.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | AUTONOMOUS |
| D48 | The event is **proposed before the originating move applies**, so an interrupt window can veto or replace it without the effect landing; a suspended move applies only when the interrupt window closes without a veto.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | AUTONOMOUS |
| D49 | Reaction declarations are **not** logged as `GameEvent`s — they are the public record in `pendingReactions.declarations`. Events produced by reactions are terminal and never enqueued (D13).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | AUTONOMOUS |
| D50 | boardgame.io **stage mirroring** (`setActivePlayers` + a `react` stage) is **deferred**: it needs real reaction content and a correct min/max-moves config for a partially-eligible group (forcing ineligible players to move is wrong). The `G`-side engine is authoritative and is driven through the bridged system moves `declareReaction` / `passReaction`; wiring those into a stage is the remaining transport step.                                                                                                                                                                                                                                                                                                                                                                              | AUTONOMOUS |
| D51 | Phase 6 is **deferred as planned**: no card content is authored (inventing rules/content is forbidden) and the admin-portal UI is medium-term. Phase 6 delivers the portal-facing substrate instead: `CardCatalogFromJson` is validated end to end at startup, and `Moves.tagIndex` / `Moves.respondsToIndex` expose the code-side tag vocabularies so the portal's `respondsTo` picker is driven by the same registry the engine uses (D13-Q4 admin implication).                                                                                                                                                                                                                                                                                                                                       | AUTONOMOUS |

| D58 | **Baseline repair (prerequisite).** The `effect` dependency was bumped to `4.0.1` (commit `6a23a40a`) after the plan targeted the `4.0.0-beta.*` line, so `packages/game` did not type-check or test at the stated 178-green baseline. Two API drifts were repaired **without changing the pinned version**: `SchemaError` is no longer re-exported from `effect` (use `Schema.SchemaError`), and `effect/testing/FastCheck` was removed (property tests now use the Effect-native `effect/Arbitrary` + `checkEffect`, still with no direct `fast-check` dependency). | AUTONOMOUS |
| D59 | **Round-2 module layout.** The catalogue pattern mirrors `Terrain.ts` (schema + Effect `Config` + normalized table + service + lint). `Resources.ts` owns the resource **and** production catalogues as one table/service; `Defense.ts` owns the defense-structure catalogue; `Edges.ts` is pure edge geometry (no Effect service). The defense catalogue is **not** pinned in `State` (it is only consumed at setup), so `State` gains a single `production` pin covering resources + production. | AUTONOMOUS |
| D60 | **Resource/production lint scope.** Lint checks referential integrity only: unique ids and every `resourceId` in a cost or output resolving; positive amounts and a non-empty `resourceProduced` are schema-enforced. The implied "Tier-II production costs Tier-I and yields Tier-II" relation is treated as **content guidance, not a hard invariant**, to avoid inventing a rule. | AUTONOMOUS |
| D61 | **Terrain caps + derived resources.** `buildableProduction` entries are validated strings (the id set is configurable, so it cannot be a static union); the cross-catalogue `lintTerrainProduction` runs once when the game service is constructed. `maxTierTwoProduction <= maxProduction` is a schema filter so a bad terrain config fails at `Config` decode. Tile resources are **derived** via `tileResources` / `buildableProduction`, never stored on `Tile`. | AUTONOMOUS |
| D62 | **Defense structures are a per-type-capped catalogue.** Each `DefenseStructure` carries its own per-nation `cap`; `makeNation` builds exactly `cap` pieces per type, so the per-type cap is structural (array composition). A `NationSupplySpec` carries the selected production kind, defense types/caps and supply-line upkeep into `makeNation`. | AUTONOMOUS |
| D63 | **Edge convention.** `edge` indexes `Coords.DIRECTIONS` (0..5) and names the neighbour across it; `borderingTiles` returns `[anchor, neighbour]`. A shared edge is canonicalised by anchoring at the lexicographically smaller tile key (`canonicalEdge`) and keyed by sorting both tile keys (`edgeKey`), so both encodings compare equal. Railroads/ports are edge-located supplies (`at: Option<Edge>`); `isPortEdge` requires exactly one land side. | AUTONOMOUS |
| D64 | **Ships.** One nation supply of length `ships` (the total cap), composed of `merchantShips` merchants + `navalShips` navies (an infeasible remainder is filled as merchant). The caps stay flat `PIECE_LIMITS` keys so per-match overrides keep working; `decodeSetupOptions` rejects a per-type cap above the total or per-type caps that cannot fill it. | AUTONOMOUS |
| D65 | **Maintenance + ports.** Supply lines carry an encoded `maintenanceCost: ResourceAmount[]`; the default is `[]` and `NationSupplySpec.supplyLineMaintenance` can set it, but the turn-based upkeep rules remain deferred (D57). Ports store only `at`; port ship capacity / docking stays deferred (§8.7). | AUTONOMOUS |
| D66 | **New caps follow the existing override path.** `supplyLines`, `railroads`, `ports`, `ships`, `merchantShips` and `navalShips` are added to `PIECE_LIMITS` and the per-match `pieceLimitsOverrideSchema` (D14/D26) rather than introducing a second config mechanism. | AUTONOMOUS |
| D67 | **Card copy counts are tiered by player count.** `cardIdentity.minimumPlayers` is **removed**; each card instead carries an ordered list of `{ minPlayers, copies }` tiers. The applicable tier is the greatest `minPlayers <= playerCount`, so the lowest tier is the card's minimum (subsuming the old field). A player count below every tier excludes the card (0 copies). The draft stack is built from the catalog filtered this way. Proposed field name to confirm at implementation: `copyTiers`. | SETTLED |
| D68 | **Phase One is a secret, simultaneous card draft (7 Wonders-style).** Every player is dealt an equal (large, configurable) hand from one shared stack built from the catalog, filtered to the player count and sized exactly `playerCount x hand size`. Each round every player secretly picks one card into their **deck** and passes the rest; drafting ends when every hand is down to one card, which is discarded. Drafting is the only thing Phase One does — it builds the decks used in a later phase. Detail and the remaining sub-question (hand size) live in `TURN_STRUCTURE.md`. | SETTLED |
| D69 | **Embassies start unplaced.** `Nation.embassy` keeps one entry per other colour (D22), but each entry gains a **placed** state. Entries begin **unplaced**; a **build** action places an embassy on the host's capital. Proposed shape: `{ host: Color, placed: boolean }` — the location stays derived from the host's capital, so no coordinates are stored. Detail in `TURN_STRUCTURE.md`. | SETTLED |

---

## 4. Phases

### Phase 0 — Test harness (safety net) — **COMPLETE**

**Goal.** Have a working, fast feedback loop _before_ changing schema, so schema edits are verifiable.

**Delivered.** 82 tests across 5 colocated files; `tsc` clean; suite runs in ~4s; nothing committed.

| File                      | Tests | Covers                                                                                                                                                                       |
| ------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BoardGeneration.test.ts` | 17    | determinism, exact counts, disjointness, contiguity, no duplicate coords, lattice gaps/overlaps, `InsufficientRoom`, `InvalidPlayerCount`, `InvalidOptions`, `neutralCoords` |
| `Cards.test.ts`           | 27    | `lintCatalog` (all 11 issue kinds), `contentHash`, `cardById`/`chitById`, `decodeCatalogJson`                                                                                |
| `Scoring.test.ts`         | 20    | `applicableMandate`, `mandateFulfilled`, `victoryPoints`                                                                                                                     |
| `Setup.test.ts`           | 11    | `decodeSetupOptions` defaults, overrides, merge, malformed input                                                                                                             |
| `Coords.test.ts`          | 7     | axial/cube round-trip, `hexDistance` and `add` laws                                                                                                                          |

Scripts added: `"test": "bun test"` in the root `package.json` and in `packages/game/package.json`.
Generator invariants run as **property-based** tests via `effect/testing/FastCheck` (see finding E).

**What held up.** The generators are solid. Determinism, exact `target` counts for 2–7 players
across many seeds, pairwise disjoint territories, contiguity, no duplicate coordinates, and every
`neutralCoords` invariant all held under property-based runs.

**Phase 0 findings (A–G).** Findings A–D each require Phase 2 work; they are folded into the items
below and recorded as decisions D14–D16.

- **A. `lintCatalog` uses the `in` operator, so `Object.prototype` members pass (real bug).**
  Verified directly: `"toString"`, `"constructor"`, `"valueOf"`, `"hasOwnProperty"` and
  `"__proto__"` all report as present in both `MOVES` and `CHECKS`. This is worse than "a bad card
  lints clean". `Scoring.mandateFulfilled` does `if (def === undefined) return false; return
  def.check(state, params)`, and `CHECKS["constructor"]` is the `Object` constructor — not
  `undefined` — whose `.check` is missing, so it **throws a `TypeError` at scoring time**. Same
  shape in `MOVES`: `MOVES["toString"]` is a function with `categories: undefined`, which the
  Phase 3 bridge would trip over. Fix with `Object.hasOwn`, or better a `HashSet` of valid ids
  built from the registry (pairs naturally with D8). Folded into Phase 2 item 7.
- **B. `target < 1` silently produces 1-tile nations (real bug).** The seed tile is placed
  unconditionally, so `target: 0` and `target: -1` return _successful_ boards with one tile each,
  contradicting the "exactly `target` tiles per nation" docstring. → D15.
- **C. Only `playerCount` is range-checked; no cross-field validation.** `noisePoolFraction`
  outside `[0,1]` is silently absorbed; `seedRingDist: 0` degenerates to `InsufficientRoom`;
  `seedRingDist: -1` silently behaves like `1`; `growthCap < seedRingDist + 2` (documented as a
  must) yields a confusing `InsufficientRoom` instead of "your options contradict each other".
  Nothing throws — all typed `Result`s — so this is diagnostics quality, not a crash. → D14.
- **D. `PieceLimits = typeof PIECE_LIMITS` is literal-typed, making the `as PieceLimits` cast in
  `Setup.ts` load-bearing.** `ResolvedSetupOptions.pieceLimits.influence` has type `8`, so any
  override is a type lie. Also confirmed: overrides accept `0`, negatives and fractions; unknown
  keys are silently **stripped**, not rejected; and because `makeSupply` is
  `Array.from({ length: count })`, a client-supplied `pieceLimits: { units: 1e9 }` makes the
  authoritative `setup` allocate a billion objects — `validateSetupData` runs the same decode and
  will not stop it. → D14.
- **E. `fast-check` is not directly importable from `packages/game`** (transitive dep of `effect`
  in bun's isolated store). Use `effect/testing/FastCheck`, which re-exports what is needed. No new
  dependency, but the plan's earlier wording was wrong.
- **F. `lattice` ignores `seed`, `target`, `noisePoolFraction`, `seedRingDist` and `growthCap`** —
  it reads only `playerCount`. Silent no-op options matter once the admin portal exposes them.
- **G. Pre-existing, not caused by Phase 0:** repo-wide `dprint check` fails on 10 files
  (`apps/web/*`, `PLAN.md`, the generated HTML report). Left alone deliberately — a repo-wide
  `dprint fmt` would rewrite `HexGridDemo.svelte`, which is off-limits.

**GATE 0 — resolved.** `bun test` confirmed (→ D10 settled). Reactions do generally need human
intervention (→ D13). `target < 1` is never legitimate, so validate `target >= 1` (→ D15).

---

### Phase 1 — Schema inventory and Tier 1 decisions

**Goal.** Produce the definitive list of what the schema is missing, and settle the three
expensive-to-reverse design decisions. **Mostly conversation. Very little code.**

**Steps.**

1. Ask the user for **their** list of what they consider missing from the schema. They have design
   documentation and will work from it — do not guess or invent game concepts. If they offer a
   document, read it carefully and ask before extrapolating beyond it.
2. Walk through the three OPEN decisions (D11, D12, D13) using the framing below, one at a time.
3. Record the outcomes in the decision log in this file.

**D11 — hidden information.** `Nation` currently holds `hand`, `deck`, `mandates` directly in the
shared `G`, so every player can see every other player's cards. boardgame.io's mechanism for this is
`playerView(G, ctx, playerID)`, which returns a redacted copy of `G` per viewer. Decide: is any of
hand / deck / private mandates / chit assignment secret? If yes, adopt `playerView` now and design
`State` so redaction is a _pure function_ of `(state, viewer)`. Deciding this after moves exist
means rewriting every move, because leaking is a property of the state shape, not the move.

**D12 — `G` vs `ctx`.** `State.turn` duplicates `ctx.currentPlayer` and `State.phase` duplicates
`ctx.phase`. Two sources of truth drift. Recommendation: delete both from `State` and read from
`ctx`. Confirm, and confirm nothing in the rules depends on retaining a historical turn/phase.

**D13 — reactions.** See Phase 5 for the full framing. The short version of the recommendation on
the table:

- **Source of truth in `G`.** After each move, a _pure_ resolution function scans the newly emitted
  `GameEvent`s against the catalog's reaction bindings and writes an explicit `pendingReactions`
  field into state (who may react, to what, in what order, what has been answered). Legal-move
  computation reads from that.
- **boardgame.io stages as transport only.** When `pendingReactions` is non-empty, mirror it into
  `events.setActivePlayers({ others: { stage: 'react', minMoves: 1, maxMoves: 1 } })` so the
  framework enforces the window and the client gets "waiting for reactions" for free.

This keeps the rules pure, deterministic, replayable and testable inside `packages/game`, while
still using the framework for suspension and multiplayer. The alternative — putting the window in
`ctx.activePlayers` and nothing in `G` — is less code but leaks rules into framework state that
cannot be replayed from `state.events`.

**Questions to resolve for D13:**

1. Does a human reaction ever require a _choice_, or are all reactions declarative?
2. Interrupt (modify/veto the event before it resolves) or triggered (react after), or both?
3. Can a reaction trigger another reaction? If yes you need a queue and a re-entrancy rule.
4. What is the ordering rule — turn order, simultaneous, or something else? Does the zone a card
   reacts from matter?
5. Should `respondsTo` reference broad _move categories_ (as it does today), or specific named
   _trigger kinds_? Categories are probably too blunt — a card that reacts to "an attack" should
   not necessarily react to "any action".

**GATE 1.** Present the schema gap list, the proposed record for D11/D12/D13, and wait for sign-off.
No code beyond notes.

---

### Phase 2 — Schema cleanup and the settled decisions

**Goal.** Apply the accumulated fixes. Each is small; all are cheap now and expensive later because
no card content exists yet.

**Steps** (do them in reviewable chunks, running `tsc` and `bun test` as you go):

1. **Typo.** `Pieces.religionFaces` uses `"prosletized"`; `Nation.makeNation` seeds it.
   Should be `"proselytized"`. Free to change right now because there is no content.
2. **`GameEvent.categories`** is `Schema.Array(Schema.String)`. Per D13-Q4 this becomes the event's
   **tags** — narrow to the `Tag` literal (a code-side vocabulary that starts empty and grows in
   Phase 4). Same for `MoveDefinition.respondsTo`, and add a `tags` field to `MoveDefinition`.
3. **`mat.cards`** carries a comment claiming "3 card slots" but the schema is an unbounded array.
   Either enforce three or fix the comment — ask which.
4. **`production.kind`** is a bare `Schema.String` while `units.kind` is narrowed to `unitKinds`.
   Make them consistent.
5. **`pieceLimits` (expanded by findings C/D).** `decodeSetupOptions` merges with
   `{ ...PIECE_LIMITS, ...o.pieceLimits } as PieceLimits` — a cast that cannot fail, and the
   override schema accepts zero, negatives and fractions. Required work:
   - Widen `PieceLimits` to `Record<keyof typeof PIECE_LIMITS, number>` so the cast can be removed
     and overrides are honestly typed.
   - Constrain each cap to an integer ≥ 1 with a sane upper bound — this also closes the
     `Array.from({ length: 1e9 })` allocation hazard from client-supplied `setupData`.
   - Decide whether unknown keys are rejected or silently stripped (currently stripped).
   - Decide whether the resolved limits get recorded explicitly in `State` (today they are only
     inferable from inventory array lengths).
   - Decide whether the "array length is the cap" invariant is enforced, or merely documented —
     it holds only while no move pushes or splices.
   - Note the related modelling gap: `makeNation` fills supplies **homogeneously** (all `units` are
     `army`, all `production` is `farm`), so limits control _counts, not composition_. `unitKinds`
     includes `missionary` and `influenceFaces` includes `goodwill`, but nothing creates them.
     If setup ever needs mixed composition, the limits schema must grow beyond `Number`.
6. **`State.Config`** is defined and referenced nowhere. Delete it or wire it up — ask which.
7. **D4 — lint-time param validation, plus the finding-A hole (D16).** In `lintCatalog`, decode each
   `binding.params` against `MOVES[binding.move].params`, and each `check.params` against
   `CHECKS[check.predicate].params`, reporting mismatches as `LintIssue`s. This is what makes
   config-authored cards genuinely safe — so it must land _together with_ the fix for finding A,
   otherwise the key lookup itself is unsound. Replace the `in`-operator membership tests with
   `Object.hasOwn` (or, better, a `HashSet` of ids built from each registry — which pairs with D8's
   catalog indexing), and harden `Scoring.mandateFulfilled` so a malformed predicate returns `false`
   rather than throwing a `TypeError`.
8. **D6 — mandates.** Delete `check.mode`. Add a `mandateStatus(state, catalog)` selector returning
   per-nation / per-card fulfilment, with a per-viewer form for the client and a full-state form for
   end-of-game scoring (D11 — mandates do **not** drive `endIf`). Keep predicates pure.
9. **D7 — single-domain mandate cards.** Encode it in the schema (singular `domain`, or a lint
   check), and remove `applicableMandate`'s `card.domains[0]` access.
10. **D8 — index the catalog.** Build `HashMap`s once inside the `CardCatalog` service
    (`cardsById`, `chitsById`, `chitsByDomain`, mandates keyed by subtype) and rewrite
    `Cards.cardById`, `Cards.chitById` and `Scoring.applicableMandate` to use
    `HashMap.get` + `Option`, and `Array.findFirst` instead of hand-rolled `find` + wrap.
11. **Phase 1 outcomes.** D12 (delete `State.turn`/`State.phase`), D19 (`Tile.control` → `Option`
    override + derived accessor), D20 (`Schema.optional` → `OptionFromOptional`; the two default
    buckets), and D11 (`State` shaped so `playerView` redaction is a pure function of
    `(state, viewer)`; the redaction itself lands in Phase 3).
12. **Terrain model (D21/D23).** Substantial. Rename/split the terrain schemas
    (`nationTerrain*` / `borderTerrain*` / `allTerrain*`); make terrain types + attributes
    configurable via Effect `Config`; `Tile.terrain` → validated id string; normalized terrain table
    pinned in `State`; lint definitions against the `*Ids` schemas; remove the per-match `terrain`
    option + `DEFAULT_LAND_TERRAIN`; implement seeded weighted-pool terrain selection (per nation,
    without replacement). Rework `Setup.test.ts` (the `terrain` override tests retire).
13. **Embassy (D22).** `embassy` → `playerCount - 1` entries storing only the host nation id; coords
    derived from the host's `capital`; `makeNation` gains the player count / other colours.

**GATE 2.** `tsc` clean, `bun test` green. Report the diff summary and any behaviour changes. Wait.

---

### Phase 3 — Assemble the boardgame.io game object (step b)

**Goal.** `Game.ServiceLive.make(config)` returns a `Game` that can actually be played in memory.

**Steps.**

1. **Bridge the registries.** Turn `MOVES` into boardgame.io's `moves` map. Each `MoveDefinition`
   becomes a long-form move: `validateMove` derived from `canApply`, and a body that unwraps the
   `Result` and returns `INVALID_MOVE` on failure. Decide how `MoveContext` (state, actor, turn, and
   possibly `ctx`/`events`/`random`) is constructed inside a boardgame.io move — per D12 it carries
   the `ctx`-derived **turn counter**, and gains `phase` once phases exist.
2. **Event logging.** Append a `GameEvent` after each successful move, so `state.events` is a
   complete replayable log (mandates and reactions both depend on this). Decide whether this is a
   wrapper around every move or a boardgame.io plugin.
3. **Turn and phase config.** `turn` with `minMoves`/`maxMoves`; a first `phases` entry. `ctx` is
   the single source of truth for turn/phase (D12 — no `State.turn`/`State.phase`). Decide where
   the "end of turn clears `playArea`" cleanup lives (`turn.onEnd` vs a move vs `endIf`).
4. **Win / end condition.** Mandates do **not** end the game (D11): they are scored when the game ends and shown to their owner meanwhile. `endIf` must therefore key off the real end-of-game trigger, which is **not yet known** (see §6). Do not wire `endIf` to the mandate selector.
5. **Redaction.** Implement `playerView` (D11 — hidden info confirmed): redact `hand`, `deck`,
   `mandates` and `mat.cards` for non-owners; everything else public.
6. **Determinism.** Reconcile `BoardGeneration`'s own seeded PRNG with boardgame.io's `random`
   plugin. Decide whether generation stays seeded from `setupData` or moves to `random`.
7. **Service wiring.** Make sure `ServiceLive` and `ServiceDev` still compose, with `CardCatalog` as
   the sole dependency.

**Tests.** Drive a full turn through a real boardgame.io `Client` in memory (no server): create a
2-player game, make a move, assert the resulting state and that an event was logged; assert an
illegal move is rejected; assert `endIf` fires at the right moment.

**GATE 3.** Report the shape of the assembled `Game`, the bridge design, and the in-memory test
results. Wait.

---

### Phase 4 — Moves (step c)

**Goal.** Implement the moves the game actually needs.

**Steps.**

1. Ask the user to enumerate the minimum viable move set. Implement **one at a time**, in the order
   they choose; each is a `MoveDefinition` registered in `MOVES`, with its `params` schema, its
   `canApply` legality rule and its `apply` implementation.
2. Each move gets: unit tests for legality (accepts the legal, rejects the illegal) and for the
   resulting state; and, where it makes sense, a card binding in a test catalog so the
   config-references-code path is exercised end to end.
3. Keep a running list of "cards that need a move that does not exist yet" — that list is the
   signal for whether the move set is the right shape.

**GATE 4 (repeating).** One gate per move, or per small group if the user prefers.

---

### Phase 5 — Reaction engine

**Goal.** Implement whichever model D13 settled on.

**Reference notes** (research already done — don't redo it):

- `dominion.games` is closed source; there is no published internals deep-dive. The useful public
  reference is **`rspeer/dominiate`**, an open-source Dominion simulator built around reactions.
  Its mechanism: reaction _hooks live on the card_ (`reactToAttack`, `reactToGain`, overridden from
  no-op base methods, guarded by an `isReaction` flag); the trigger is a **mutable event object**
  passed to each reactor, which may set `attackEvent.blocked = true` — so it is a fold
  (`reactions.reduce(applyReaction, event)`) giving _interrupt_ semantics; and ordering is explicit
  at each trigger site (active player's own cards first, then opponents in seat order — i.e. APNAP).
  Dominiate never needs to suspend because its "players" are AIs that answer synchronously; that is
  precisely the problem a real multiplayer game has and it must be solved with prompts/stages.
- Magic-style engines generalize this into interrupts (modify the event first) vs triggered
  abilities (fire after, on an ordered queue). Dominion deliberately has no stack.
- boardgame.io's primitive for the suspension is **stages**: `setActivePlayers({ others: {
  stage: 'x', minMoves: 1, maxMoves: 1 } })`, with `ActivePlayers.OTHERS_ONCE` as a preset. Note two
  properties: a stage **overrides the moves map**, so reacting players can only make reaction moves
  (semantically ideal); and it stores the window in `ctx.activePlayers`, not `G` (which is why the
  recommendation is to mirror it from `G` rather than depend on it).

**D13 sub-question status.**

- **Q1 — SETTLED: both.** Interrupt (pre-resolution modify/veto) _and_ triggered
  (post-resolution queue) reactions exist. **Architectural consequence: a move is no longer atomic.**
  The pipeline becomes _propose event → interrupt window (fold reactors over the in-flight event,
  which may mutate or veto it) → resolve → trigger window (enqueue reactions to the resolved event)_.
  So `pendingReactions` must be able to hold an **in-flight event awaiting interruption**, not merely
  "who may respond afterwards". This shapes Phase 3's move bridge, not just Phase 5.
- **Q2 — SETTLED: no, reactions are terminal.** An event produced by a reaction can never be
  reacted to. No stack, no queue, no loop guard. _Implementation cushion (keeps the promised
  "easy to change later"):_ model the pending window as a **list** and the resolver as a **loop over
  that list**, but simply never enqueue a reaction-produced event — so upgrading to queued later is
  a rules change, not a schema change.
- **Q3 — SETTLED (ordering).** Two windows: an **interrupt window** _before_ the event applies
  (target's block/redirect, then other interrupters), then, if the event survives, a **trigger
  window** _after_ it applies. Within each window: the **targeted** player's reaction resolves
  first, then other reactions in the **time-bound order they were played**; all eligible players are
  **prompted simultaneously**, and a declaration is **public immediately**. **Events may have no
  target** (e.g. reacting to a player building on their own tile) — then ordering is pure declaration
  order. Consequences: (a) the event's **target is optional**; (b) `pendingReactions` is a
  **declaration queue** (public, ordered), not just a "who may respond" set — declared reactions are
  recorded _before_ their effects are applied; (c) a monotonic sequence (reuse `GameEvent.seq`)
  timestamps declarations; (d) the framework stage prompts all eligible reactors at once.
  Follow-ups to pin at design time: what **closes** the window; whether one player may play **more
  than one** reaction to the same event; and multi-target events.
- **Q4 — SETTLED: tags (option B).** A move carries named **tags** (a code-side vocabulary of
  event/trigger kinds, open-ended like `MOVE_CATEGORY_IDS` but extensible); `respondsTo` becomes
  `ReadonlyArray<Tag>` and matching is set-intersection against the triggering event's tags;
  `GameEvent.categories` becomes the event's tag(s). **The tag list starts empty and is authored in
  Phase 4** as moves are written. **Admin implication (Phase 6):** the config UI must expose the
  available tags — ideally grouped with the moves that carry each — so an author can pick
  `respondsTo` tags for a react card. Follow-up: whether the existing structural `categories`
  (action/react/trigger/passive) survive alongside tags (recommended: yes — they say _how a move is
  invoked_, a different axis from _what event it emits_).

**GATE 5.** Design review before implementation, then a gate on the implementation.

---

### Phase 6 — Deferred: catalog content and admin portal

Not part of the short-term goal. For the record, the medium-term shape: author a real catalog JSON,
load it through `CardCatalogFromJson` (decode + lint at startup), and build the admin portal on top
of the same schema so the portal and the engine cannot disagree about what a card is.

---

## 5. Out of scope for this thread

- `packages/server` / boardgame.io `Server` / lobby / multiplayer transport.
- The SvelteKit game UI and the Svelte 5 client wrapper (D9). The demos stay as they are.
- CI setup.
- Fixing the `effect` version skew (user-owned).
- `svelte-check` errors in the throwaway demos.

---

## 6. Open questions carried into the thread

1. **The user's own list of what's missing from the schema.** Blocking Phase 1. `SCHEMA.md` is the
   companion inventory to diff against.
2. **`mat.cards`** — enforce three slots, or just fix the comment?
3. **`State.Config`** — delete or wire up?
4. **D14 range/cross-field bounds** — confirm the specific bounds (especially the piece-limit cap
   upper bound) and the unknown-key and `State`-recording choices.
5. **D18** — add the `Pieces` helper tests now, or leave the net as-is?
6. **Commit convention** — jj, git, or neither, and how the user wants changes landed. Still
   unanswered from GATE 0, and the Phase 0 work is uncommitted.
7. **D20 at the boardgame.io boundary** — `Option` values will live inside `G`, which
   boardgame.io serializes. The in-memory client will not expose a round-trip bug; verify in
   Phase 3 that tagged `Option`s survive state serialization.
8. **Game-end trigger** — mandates are win conditions but do not end the game, so what does?
   (Turn limit, deck exhaustion, a specific card, a capital capture?) Unknown; needed before
   `endIf` can be wired (Phase 3 step 4).
9. **Deferred leak vectors (D11 point 3)** — leaving for now, revisit if they bite: (a) the
   boardgame.io move log records move arguments, so a move that takes secret information as a
   parameter would expose it; (b) `deck` is stored in plain order in `G`, so order is secret but
   not hidden from the server log. Both are marked, not fixed.
10. **Event shape for reactions (D13)** — the event's **target** is optional; confirm whether it is a
    single `Option<Color>` or a list (multi-target), plus the design-time follow-ups in Phase 5:
    what **closes** a reaction window, whether a player may play **more than one** reaction to one
    event, and how "the targeted player" is defined for a multi-target event.
11. **Structural `categories` (D13-Q4)** — confirm `categories` (action/react/trigger/passive)
    survive alongside the new **tags**, rather than tags subsuming them.
12. **Terrain config details (D21)** — fix at implementation: does the terrain table get its own pin
    in `State`, or do catalog + terrain share one config pin (version + hash)? And is the
    terrain-selection draw seeded from the same `seed` as board generation, or a derived value?

**Settled at GATE 0:** D10 (`bun test`), D15 (`target >= 1`), D16 (prototype hole), D17 (keep
`KNOWN BUG` tests failing-on-fix), and D13's first sub-question (reactions need human intervention).
**Settled in Phase 1:** D11 (hidden info), D12 (delete `State.turn`/`State.phase`), D13 (`tags`,
terminal reactions, two windows, target-first ordering), D19 (`Tile.control`), D20 (`optional` →
`Option`).

---

## 7. User schema notes (from `USER_NOTES.md`)

The user's own gap list. **All three resolved** (D21–D23, below).

### 7.1 Terrain schemas — rename + make configurable → **D21 (SETTLED)**

Rename to:

- `nationTerrainIdsSchema` / `nationTerrainSchema` — all possible **nation** tile terrains.
- `borderTerrainIdsSchema` / `borderTerrainSchema` — border terrain ("sea"); ids hardcoded, room
  for attributes later.
- `allTerrainIdsSchema` / `allTerrainSchema` — union of the two.

Each nation terrain type has attributes (all configurable; number of types configurable): tile name ·
population · population display text · movement · movement display text · asset id · **tile count**
(how many tiles of that terrain each nation has). The `*Ids` schemas are lookups for the
configuration schemas; configuration is injected via **Effect `Config`** (game-level, not per-match
`setupData`).

**Resolved:** replaces `landTerrainSchema`/`terrainNameSchema`; `Tile.terrain` becomes a validated
**id string**; attributes are **normalized** in a terrain table keyed by id and **pinned in `State`**;
definitions are **linted** against the `*Ids` schemas; `population`/`movement` **are read by the
engine**; config is injected via **Effect `Config`** at **game level**, so the per-match `terrain`
option and `DEFAULT_LAND_TERRAIN` are **removed**.

### 7.2 Embassy → array → **D22 (SETTLED)**

`embassy` becomes one entry per _other_ nation, each naming its **host nation**; the embassy sits in
that nation's **capital**; at most one embassy per host colour. The entry stores **only the host nation
id**; its coordinate is **derived** from the host's `capital`, so it follows the capital. `makeNation`
needs the player count / other colours.

### 7.3 Terrain selection model → **D23 (SETTLED)**

`target` stays an **independent** variable. Terrain **tile counts** form a **weighted pool whose sum
exceeds `target`**; each nation draws `target` tiles **independently from its own copy of the pool**
(per nation, with **no cross-nation uniqueness constraint**), **without replacement**, and places them
randomly on its generated coords; sea (border terrain) is excluded. The draw is **seeded** for
reproducibility.

---

## 8. Round 2 schema notes (resources, production, infrastructure)

The user's second gap list (`USER_NOTES`), **superseding D27**. Answers to the batch-1 questions are
folded in as decisions **D52–D57**.

### 8.1 Resources & production → **D52**

- **Resources** are a **configurable catalogue**: `{ id, name, tier: 1 | 2 }`. Tier I (basic) is
  collected from terrain tiles; Tier II (advanced) is manufactured from basic resources.
- **Production kinds** are a **configurable catalogue**: `{ id, name, tier, resourceCost:
  Array<{ resourceId, amount }>, resourceProduced: Array<Array<{ resourceId, amount }>> }`. More than
  one inner array in `resourceProduced` means **choose one set per turn**.
- **Tile resources are derived from buildable production** — there is no separate per-tile resource
  field.
- `production.kind` therefore references a configurable production id, **not** the literal `["farm"]`
  (D27 is dead).

### 8.2 Terrain gains buildable production + caps → **D53**

`nationTerrainSchema` gains `buildableProduction: Array<ProductionId>`, `maxProduction: Int` (max
production **per tile**) and `maxTierTwoProduction: Int` (max Tier-II production **per tile**; e.g.
plains: ≤ 4 total, ≤ 2 tier II). All configurable via Effect `Config`.

### 8.3 Built facilities are pieces → **D54**

Built structures are **nation pieces with `at`** (the existing `Nation.production` shape), not fields on
`Tile`; `Tile` / terrain records only what is _buildable_. Confirmed for **production**, **defense
structures** and **supply lines**. Each is a supply with a configurable `kind` catalogue: defense
structures have a **per-type** configurable cap; supply lines a **per-nation** cap.

### 8.4 Edge-based placement (railroads, ports) → **D55**

Edges are encoded **`{ tile: Coords, edge: 0..5 }`** (six edges per hex). Helpers must make it easy to
derive **both bordering tiles** of an edge (canonicalised so a shared edge is one value). A **port** is
an edge whose two sides are nation terrain and sea; **railroads** are edges. Both railroads and ports
have **per-nation caps** (configurable).

### 8.5 Ships → **D56**

Ships live on **sea tiles** (`at`). They are a **separate, configurable supply** (not `units`), one per
nation and **coloured**. Caps are configurable: a **total** ship cap plus per-type caps for **merchant**
and **naval**.

### 8.6 Maintenance → **D57**

Supply lines (and any other upkeep-bearing structure) encode a `maintenanceCost`
(`Array<{ resourceId, amount }>`) now; the **turn-based upkeep rules are deferred**.

### 8.7 Open questions (round 2)

Resolved: (1) production caps are **per tile**; (2) **defense structures**, **supply lines**, **ships**,
**railroads** and **ports** are all pieces with `at` and configurable caps (defense: per type; supply
lines, railroads, ports: per nation). Still deferred: **port ship capacity vs the ship supply**
(docking rules) — not needed now.

### 8.8 Rework scope (implementation) — **Phase 7**

This is a fresh chunk beyond the completed Phase 2–6:

- Replace `Pieces.productionKinds = Literals(["farm"])` with a **configurable production catalogue**
  and a **configurable resource catalogue** (Effect `Config`, pinned in `State` like terrain).
- Extend `nationTerrainSchema` with `buildableProduction` + the two per-tile caps (D53).
- Add piece supplies for **defense structures**, **supply lines**, and **ships**, with configurable caps.
- Add an **edge** module (`{ tile, edge }` + both-tiles helper) and edge pieces (railroads, ports).
- Encode `maintenanceCost` on supply lines; rework `Nation.production` to reference production ids.
- Revisit `PIECE_LIMITS` / `makeNation` for the new supplies and per-nation caps.
