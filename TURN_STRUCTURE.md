# Land of Bron — Turn & Phase Structure

Scratch design document for the game's turn/phase structure. Companion to `PLAN.md`; every outcome
here gets folded into `PLAN.md`'s decision log once it is agreed. Not permanent documentation —
delete when it stops being useful.

**Status:** in progress. Nothing in this document is implemented yet. The engine currently runs on a
placeholder (see "Current engine state" below).

**Working rule:** do not invent rules. Every field below is filled in from the user's design, and
marked `[SETTLED]` only once agreed.

---

## Overview

The game has **three phases** (per the user). Names and semantics are still to be defined.

| #   | Name | Scope (per turn? per round? whole game?) | Status |
| --- | ---- | ---------------------------------------- | ------ |
| 1   | TBD  | TBD                                      | draft  |
| 2   | TBD  | TBD                                      | todo   |
| 3   | TBD  | TBD                                      | todo   |

Open framing questions:

- Are these three phases **per turn**, **per round**, or **three phases of the whole game**
  (a start phase, a main phase, an end phase)?
- Do all players move through each phase in seat order, or does a phase run for all players at once?
- Does a phase have a **mandatory** component (e.g. produce resources, pay upkeep) or is it purely a
  window in which certain moves become legal?

---

## Phase One

**Name:** TBD — the user calls it a "card drafting turn"
**Scope:** **one-time game opening** **[SETTLED]** — the draft is a one-off step. Once Phase Two
begins, all cards are drafted and there is no further drafting.

### User-stated (draft)

- Phase One is a **card-drafting** phase, modeled loosely on the board game **7 Wonders**.
- Every player starts with the **same flat number of cards**.
- Starting hand size: **undecided** — the user describes it as "considerable" and is not sure of the
  exact number yet. Treat it as configurable.
- **Draft mechanic (confirmed):** each player takes exactly one card from their hand, then passes the
  remaining hand to the next player.
- Pass direction: **configurable** (left/right undecided; whether it alternates is undecided; the user
  is not sure it matters).
- Picked card: added to the player's **deck** — not kept in hand, not played immediately. Drafting is
  the *only* thing Phase One does: it builds each player's deck. The drafted cards are used in a
  later phase.
- Drafting ends when a player's hand is down to **one card** (corrected from an earlier "two"). You
  keep drafting until a single card remains, and that final card is discarded.
- Derived from a 16-card starting hand: 15 picks → **15-card deck**, final card discarded.
  **[SETTLED]** — the draft loop is confirmed by the user. (The earlier "14" was a slip.)
- Drafting is **simultaneous** for all players, but the picks are **secret** — the card a player keeps
  is hidden from opponents (it goes into the secret deck, consistent with D11).
- **Engine implication (draft, not decided):** simultaneous + secret drafting is not a native
  boardgame.io turn; it will likely need every player active at once (an `all` active-player set or a
  simultaneous turn order) plus redaction of the picked card. Revisit at implementation.
- **Phase One ends** when every player's hand is down to one card — all players finish together.
  **[SETTLED]**
- **Card source:** one shared **stack** built from the card catalog (discussed in earlier sessions).
  Each card type contributes a certain number of copies to the set. The stack is shuffled and dealt
  out to all players.
- **Player-count filtering (7 Wonders style):** every card carries a player-count association; cards
  are included or excluded from the stack based on the match's player count. **[SETTLED]** Only a
  **minimum** — a card is included when the player count is at least its `minimumPlayers`. No maximum.
- **Stack size:** exactly `playerCount × hand size` — no leftover, undealt pile. **[SETTLED]** One
  shared shuffle.
- **Card schema addition [SETTLED]:** each card records **how many copies** of it live in the stack,
  and that copy count varies by player count. Shape: an ordered list of `{ minPlayers, copies }`
  **tiers**. The applicable tier is the one with the greatest `minPlayers <= playerCount`, and its
  `copies` is the card's copy count. A player count below every tier means the card is excluded
  (0 copies).
  - Semantics confirmed by the user: a count applies **at its listed player count and above**.
    Example: 1 copy at 3 players, 2 copies at 4-plus (through 6), 3 copies at 7-plus.
  - This **subsumes** the existing `minimumPlayers` inclusion gate (a card's lowest tier is its
    minimum).
  - **`minimumPlayers` is REMOVED** (user decision): the tier list replaces it. Proposed field name
    (to confirm at implementation): `copyTiers: Array<{ minPlayers: Int, copies: Int }>`.
- The catalog has no per-card copy count today (`cardIdentity` = `id, name, body, age,
  minimumPlayers`). Phase One needs it, and it needs a content-rich catalog, which is currently
  deferred (D51).

### Follow-up questions

1. Starting hand size — see "undecided" note above.
2. Which later phase uses the drafted cards, and how?

### Entry

- What starts Phase One? (start of the game / start of each turn / a trigger mid-game)
- Who enters it, and in what order?

### What happens

- What is the player allowed to do in Phase One?
- What is the player **required** to do (forced choices, mandatory production, upkeep)?
- Which moves become legal only in this phase?

### Resources / cards

- Is anything produced, collected, drawn, or discarded in this phase?
- Which catalogues are read (terrain, production, resources, defense)?

### Boundaries

- What ends Phase One — a player action, a move count (`minMoves`/`maxMoves`), a choice, or
  exhaustion of some pool?
- Are there start-of-phase or end-of-phase effects?

### Interaction

- Can events emitted in this phase be reacted to (interrupt / trigger windows)?
- What is public vs hidden during this phase?

### Engine mapping (fill in at implementation)

- boardgame.io `phases` entry, `turn.minMoves`/`maxMoves`, `next`, `onBegin`/`onEnd`, `endIf`.

---

## Phase Two

**Name:** TBD
**Scope:** TBD (once at game start? every turn?)

### User-stated (draft)

- At the very beginning of Phase Two, the **board is set up**: the tiles are laid out, using the
  **board generation** system and the **terrain assignment** system.
- Phase Two and Phase Three are **structurally similar** — both are action phases.
- **Phase Two** allows actions that, **for the most part, interact only with the acting player's own
  nation**.
- **Phase Two is a bounded development period [SETTLED structure]:** players take turns in **seat
  order**, going around the table for a **set number of rounds**. Each turn is self-directed — building
  up the player's own resources and structures. When those rounds finish, Phase Two ends.
- **Phase Three** opens up **inter-player interaction**: military conflict, trade, religious influence,
  and so on.

### Already built (for reference)

- **Board generation exists:** `BoardGeneration.generateCoords`, with the `lattice` and `frontier`
  strategies behind a registry, chosen via `setupData.strategy`.
- **Terrain assignment exists:** each nation draws `target` terrain ids from its own weighted pool
  (without replacement) and places them seeded-randomly on its coords — `Random.weightedDraw` +
  `Random.shuffle`, seeded by `Random.nationSeed(seed, nationId)` (D23/D29/D34). **So yes, the terrain
  system is built.**
- Both currently run **inside `setup`** (match creation), before any phase: board → terrain draw →
  tiles (plus the sea ring) → nations. See `Game.ts`.
- Note: the Phase One draft is **not** implemented yet — nations currently start with empty hands and
  decks, and there is no card content (D51).

### Reveal constraint [SETTLED]

- **When** generation is computed is free. The hard requirement is **information hiding**: from the UI
  and player perspective, nobody knows what the board looks like until the beginning of Phase Two.
- **Chosen implementation [SETTLED]:** keep generation in `setup` (validation errors surface at match
  creation, determinism stays centralized), and **redact `tiles` in `playerView` while the game is in
  Phase One**. The board becomes visible the instant Phase Two begins (the redaction approach).
- Rejected alternative: generate in Phase Two's `onBegin` so tiles do not exist during Phase One at
  all.

### Open (implementation)

- Does Phase Two run **once at game start**, or **every turn**?

### Open (rules)

- **How many rounds Phase Two runs for is configurable** (the value itself is TBD — user, later).
- What are the Phase Two exceptions to "only your own nation" (the "for the most part")?
- What is produced or collected during Phase Two, and are pieces placed?
- Does Phase Three also run as rounds of turns, or is it open-ended?
- **What ends Phase Three / the game — TBD (user, later).** The user wants a fairly *predictable* end
  that can nevertheless finish early or stretch out depending on how players play. This is the same
  open question as PLAN.md open question 8 (`endIf`).

---

## Phase Three

**Name:** TBD
**Scope:** TBD

### User-stated (draft)

- Begins **after** Phase Two's fixed number of rounds **[SETTLED]**. Players then use their built-up
  nations and interact with one another.
- Structurally similar to Phase Two, but opens up **inter-player interaction**: military conflict,
  trade, religious influence, and so on.

### Open (rules)

- What exactly is allowed here that Phase Two forbids?
- What ends Phase Three?

---

## Turn budget / resources (tentative)

**Status: tentative.** The user is still deciding whether to use an action economy at all. The
following is a *working assumption*, not a settled rule.

- Like **Dominion**, a turn begins with a **pool of things you may do**.
- Turn pools **[revised by the user]**: there is **no action pool**. The pools are:
  - **Build** — one per turn. Construct a structure (e.g. a trading post, a production facility).
    Building also **spends the structure's resource cost** (user: "presumably in most situations", so
    exceptions may exist).
  - **Move** — one per turn. Move a unit (e.g. an army, a missionary).
  - **Attack** — one per turn, **Phase Three only** **[SETTLED: scope]**. It is the single pool for
    **all** Phase Three inter-player interaction — hostile (military conflict) and non-hostile (trade,
    religious influence) alike. The name is expected to generalise (e.g. to "interact").
- **Playing cards is unlimited** — there is no per-turn limit on how many cards you play. (An earlier
  "one action" reading is superseded: the action slot is really the attack slot.)
- The engine's current placeholder `turn: { minMoves: 0, maxMoves: 1 }` already matches a
  one-action turn.

### Open questions

1. Are build, move, and attack **one each per turn**, refilled every turn? (The user will address this.)
2. Do Phase Two and Phase Three share pools, or does Phase Three add the attack pool on top?
3. What exceptions exist to "a build spends resources"?
4. Is this pool economy settled, or still tentative?

---

## Resource income & storage (tentative)

**Status: tentative.** The user is walking through this.

- Resources work much like **7 Wonders**.
- Primary sources of income:
  1. The **population** of the tiles you control → **currency / money** (separate from the tiered
     resources).
  2. **Production facilities** you have built → **resources** (the tiered kinds).
- **Population is a terrain attribute** (one of the terrain settings). A tile's population converts to
  **currency**. There will be a currency value in the nation structure, but the **exact mechanism is
  undecided**.
- **Population modifier tokens [deferred]:** tokens that can be placed on a tile to change that tile's
  population. To be handled later.
- Production facilities yield resources **each turn**, and resources **auto-refill each turn** — i.e.
  per-turn income rather than an accumulating stockpile by default.
- **Per-turn income resets each turn [SETTLED].** Unspent normal resources do **not** carry over; the
  reserve is the only thing that persists between turns.
- There is an **additional mechanism to store** resources (the user will explain). This is the exception
  to the auto-refill model.
- **Storage rules [mostly settled]:**
  - At most **one** resource token is added to the storage pile **per turn** — one total, not one per
    resource type.
  - Stored tokens **accumulate across turns** (the user's example: over three turns a player could have
    three tokens of various kinds on the mat).
  - The pile is a **persistent reserve** **[SETTLED]**: stored tokens stay on the mat **until spent** and
    carry over from one turn to the next. They are *not* swept into the pool each turn.
  - Tokens are **cashed in** when needed — e.g. a banked timber token is spent on the turn the player
    needs an extra timber. Spent tokens are removed: digitally they simply vanish; physically they go
    back to the general token pile.
- Engine cross-reference: the resources/production catalogues (D52/D53) already model resources with a
  tier, production with `resourceCost` / `resourceProduced`, and terrain with `buildableProduction` +
  per-tile caps. `population` is currently a terrain attribute. How tile population maps to resource
  income still needs pinning down.

### Open

- **Currency representation — DEFERRED (user).** Whether currency is a single value or token-based, and
  exactly how tile population converts to it, is deferred to later.
- Where do the **per-turn resource pool**, the **reserve**, and **currency** live in the nation schema?
  (`Nation` currently has no resource stockpile or currency — resources are derived, D52/D53.)
- Can a player cash in several stored tokens in one turn, and is cashing in optional?

---

## Turn boundaries (cross-cutting)

### User-stated (draft)

- A turn ends when the player's **pool** of available things to do is expended.
- **End of turn:** the player **discards their hand**, then **draws a new hand of the same number of
  cards**. The per-turn hand size is **fixed** (the same every turn).
- When a player's **deck runs out**, the **discard pile is shuffled back in** to form a new deck.

### Open

- Can a player end their turn early, or only when the pool is fully spent?
- What ends a **turn**?
- What is the **turn order**, and who is the active player?
- Does a full set of turns for every player constitute a **round**?
- End-of-turn cleanup: the engine currently clears every nation's `playArea` in `turn.onEnd` (D38).
  Does that rule stay, move to a phase boundary, or change?
- How many moves per turn (the engine currently uses `minMoves: 0, maxMoves: 1`, a placeholder D37)?
- What ends the **game**? (`endIf` is currently inert — D39; mandates do not end the game.)

---

## Current engine state (for reference)

From `packages/game/src/Game.ts` (placeholder configuration, D37/D38/D39):

```ts
phases: { action: { start: true } },   // single phase, the phase-name vocabulary is `["action"]`
turn: { minMoves: 0, maxMoves: 1, onEnd: clears every nation's playArea },
endIf: () => undefined,                // seam only
```

- `State.ts` defines `phaseSchema = Literals(["action"])` — the only phase name today.
- `MoveContext` carries `{ state, actor, turn, phase, pendingEvent? }`; `turn` is the `ctx.turn`
  counter and `phase` is the current boardgame.io phase name.
- The reaction engine already has its own **two windows** (interrupt / trigger) — those are a
  different axis from the game's player-facing phases, and are not in `phaseSchema`.

---

## Open questions

1. Are the three phases per turn, per round, or whole-game?
2. What are their names?
3. What is mandatory in each?
4. What ends a turn (as distinct from ending a phase)?
5. What ends the game?
