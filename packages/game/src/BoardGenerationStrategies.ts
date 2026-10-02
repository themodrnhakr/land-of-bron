import { Array, HashMap, Option, Order, pipe, Result } from "effect";
import type { InsufficientRoomError, ResolvedGenerateCoordsOpts } from "./BoardGeneration.ts";
import * as Coords from "./Coords.ts";
import { nextRandom } from "./Random.ts";

// ============================================================================
// Strategy: Lattice
// ============================================================================

// The 7-tile nation shape: a center tile plus its six surrounding hexes. This shape
// defines the lattice strategy, so it is fixed rather than configurable.
const LOCAL_7_HEX: readonly Coords.Coords[] = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

// Super-lattice offsets (i, j) → nation center (Q, R) via Q = 2i - j, R = i + 3j.
// Packing the 7-tile hex blobs on this lattice tiles the map with zero gaps.
// Defines the strategy, so the positions are fixed rather than configurable.
const SUPER_LATTICE: readonly Coords.Coords[] = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

/**
 * The classic map: identical 7-tile hex blobs stamped on a zero-gap lattice.
 *
 * The shape and positions are fixed by the lattice, so generation always
 * succeeds; it supports up to 7 nations (one per lattice position).
 */
export const Lattice = {
  /**
   * @param opts - Resolved options (`playerCount` is the only field used).
   * @returns A territory per nation.
   */
  generate(opts: ResolvedGenerateCoordsOpts): Result.Result<Array<Array<Coords.Coords>>, never> {
    return Result.succeed(
      pipe(
        SUPER_LATTICE,
        Array.take(opts.playerCount),
        Array.map((superPos) => {
          // super coords -> real hex center, then stamp the 7-tile shape there
          const center: Coords.Coords = {
            q: superPos.q * 2 - superPos.r,
            r: superPos.q + superPos.r * 3,
          };
          return pipe(LOCAL_7_HEX, Array.map((offset) => Coords.add(center, offset)));
        }),
      ),
    );
  },
};

// ============================================================================
// Strategy: Frontier
// ============================================================================

// A frontier cell is an unclaimed hex adjacent to a nation's territory.
// `own` is a growth heuristic: how many of its 6 neighbors already belong to
// that nation. own >= 2 means the cell fills a concave notch ("filler"), while
// own === 1 means it extends an arm ("tip"). It exists only during generation.
interface FrontierCell extends Coords.Coords {
  own: number;
}

// The entire growth process is a pure fold over this immutable state: a cell
// → nation map plus a per-nation tile count. Nothing is mutated; every step
// produces a new state.
interface FrontierState {
  map: HashMap.HashMap<Coords.Coords, number>;
  counts: ReadonlyArray<number>;
  seed: number; // PRNG state — threaded purely, advanced one draw per claim
}

// The 6 cells surrounding a given tile.
const neighborsOf = (tile: Coords.Coords): Array<Coords.Coords> =>
  pipe(Coords.DIRECTIONS, Array.map((dir) => Coords.add(tile, dir)));

// Count how many of a cell's neighbors belong to the given nation.
// Lookups use plain {q,r} objects: v4 structural equality (Equal.equals)
// matches them against the map's keys with no string conversion.
const countOwnNeighbors = (
  map: HashMap.HashMap<Coords.Coords, number>,
  id: number,
  cell: Coords.Coords,
): number =>
  pipe(
    Coords.DIRECTIONS,
    Array.reduce(0, (acc, dir) => {
      const owner = HashMap.get(map, { q: cell.q + dir.q, r: cell.r + dir.r });
      return Option.isSome(owner) && owner.value === id ? acc + 1 : acc;
    }),
  );

// All unclaimed cells a nation could claim next: the neighbors of its tiles
// that are still free and inside the growth cap. Purely descriptive — nothing
// is claimed here, only enumerated.
const frontierOf = (
  map: HashMap.HashMap<Coords.Coords, number>,
  id: number,
  growthCap: number,
): Array<FrontierCell> =>
  pipe(
    HashMap.toEntries(map), // every [cell, owner] pair
    Array.filter(([, owner]) => owner === id), // this nation's tiles
    Array.flatMap(([tile]) => neighborsOf(tile)), // the 6 neighbors of each
    Array.filter(
      (cell) => !HashMap.has(map, cell) && Coords.hexDistance(cell, Coords.ORIGIN) <= growthCap,
    ),
    Array.dedupe, // drop duplicates (structural)
    Array.map((cell) => ({ ...cell, own: countOwnNeighbors(map, id, cell) })),
  );

// A nation that is able to grow in the current round.
interface CandidateRound {
  id: number;
  count: number;
  frontier: Array<FrontierCell>;
}

// Pick the nation to move this round: the most-constrained one (fewest open
// frontier cells; ties broken by smaller size). Because the most-constrained
// nation always moves before anyone can wall it in, every nation is guaranteed
// to reach its target size whenever the map has enough room — this is the
// invariant that makes "exactly target tiles per nation" hold.
const pickMostConstrained = (
  state: FrontierState,
  frontiers: Array<Array<FrontierCell>>,
  target: number,
): Option.Option<CandidateRound> =>
  pipe(
    Array.makeBy(state.counts.length, (id): CandidateRound => ({
      id,
      count: state.counts[id] ?? 0,
      frontier: frontiers[id]!,
    })),
    Array.filter((r) => r.count < target && r.frontier.length > 0),
    Array.reduce(Option.none<CandidateRound>(), (best, r) => {
      if (Option.isNone(best)) return Option.some(r);
      const b = best.value;
      const moreConstrained = r.frontier.length < b.frontier.length
        || (r.frontier.length === b.frontier.length && r.count < b.count);
      return moreConstrained ? Option.some(r) : best;
    }),
  );

// One step of the seeded PRNG lives in Random.ts so generation and terrain
// selection share a single, reproducible stream.

// Pick which frontier cell to claim. Filler-first: fill concave notches before
// extending arms, so shapes glob together. Within that pool, pick randomly
// among the closest noisePoolFraction of candidates so borders stay ragged.
const chooseCandidate = (
  candidates: Array<FrontierCell>,
  anchor: Coords.Coords,
  noisePoolFraction: number,
  seed: number,
): { cell: Coords.Coords; nextSeed: number } =>
  pipe(
    Array.filter(candidates, (c) => c.own >= 2), // fillers preferred...
    (fillers) => (fillers.length > 0 ? fillers : candidates), // ...tips only as fallback
    Array.sortBy(Order.mapInput(Order.Number, (c) => Coords.hexDistance(c, anchor))),
    Array.take(Math.max(1, Math.floor(candidates.length * noisePoolFraction))),
    (pool) => {
      const [roll, nextSeed] = nextRandom(seed);
      const chosen = pool[Math.floor(roll * pool.length)]!;
      // Strip the `own` bookkeeping field: map keys must be plain {q,r} so
      // that structural equality matches the cells used in has()/get().
      return { cell: { q: chosen.q, r: chosen.r }, nextSeed };
    },
  );

// Immutable claim: store the cell under the nation and bump its count.
const claim = (
  state: FrontierState,
  id: number,
  cell: Coords.Coords,
  nextSeed: number,
): FrontierState => ({
  map: HashMap.set({ q: cell.q, r: cell.r }, id)(state.map),
  counts: pipe(state.counts, Array.map((c, i) => (i === id ? c + 1 : c))),
  seed: nextSeed,
});

// One growth step: if some nation can still grow, claim exactly one cell for
// the most-constrained one; otherwise signal that the growth is complete.
const round = (
  state: FrontierState,
  opts: ResolvedGenerateCoordsOpts,
  seeds: ReadonlyArray<Coords.Coords>,
): { state: FrontierState; done: boolean } =>
  pipe(
    Array.makeBy(opts.playerCount, (id) =>
      (state.counts[id] ?? 0) >= opts.target
        ? []
        : frontierOf(state.map, id, opts.growthCap)),
    (frontiers) => pickMostConstrained(state, frontiers, opts.target),
    Option.match({
      onNone: () => ({ state, done: true }), // nobody can grow — finished
      onSome: (r) => {
        const { cell, nextSeed } = chooseCandidate(
          r.frontier,
          seeds[r.id]!,
          opts.noisePoolFraction,
          state.seed,
        );
        return { state: claim(state, r.id, cell, nextSeed), done: false };
      },
    }),
  );

// Fold the rounds until nobody can grow. Purely recursive — Effect.iterate
// isn't in this beta, and the depth (≤ target × playerCount) is tiny.
const grow = (
  state: FrontierState,
  opts: ResolvedGenerateCoordsOpts,
  seeds: ReadonlyArray<Coords.Coords>,
): FrontierState => {
  const result = round(state, opts, seeds);
  return result.done ? result.state : grow(result.state, opts, seeds);
};

// Seed tiles: one nation at the center, the rest on a ring at seedRingDist.
const makeSeeds = (opts: ResolvedGenerateCoordsOpts): Array<Coords.Coords> =>
  pipe(
    Coords.DIRECTIONS,
    Array.map((dir) => ({ q: dir.q * opts.seedRingDist, r: dir.r * opts.seedRingDist })),
    Array.prepend(Coords.ORIGIN),
    Array.take(opts.playerCount),
  );

// Rebuild per-nation territories from the final map. HashMap iteration order
// is not insertion order, so each nation's seed tile is placed first
// explicitly and the rest is sorted by distance from it for a fully
// deterministic layout.
const groupTerritories = (
  map: HashMap.HashMap<Coords.Coords, number>,
  seeds: ReadonlyArray<Coords.Coords>,
  playerCount: number,
): Array<Array<Coords.Coords>> =>
  pipe(
    Array.makeBy(playerCount, (id) => {
      const seed = seeds[id]!;
      const rest = pipe(
        HashMap.toEntries(map),
        Array.filter(([, owner]) => owner === id),
        Array.map(([cell]) => cell),
        Array.filter((cell) => cell.q !== seed.q || cell.r !== seed.r),
        Array.sortBy(Order.mapInput(Order.Number, (c) => Coords.hexDistance(c, seed))),
      );
      return [seed, ...rest];
    }),
  );

/**
 * Noisy, competitive growth with ragged borders and thin neutral seams.
 *
 * Nations grow from seed tiles (one at the center, the rest on a ring at
 * `seedRingDist`) by claiming frontier cells. The most-constrained nation
 * moves first and picks randomly among the closest cells, so borders stay
 * ragged while every nation still reaches exactly `target` tiles — provided
 * the map has enough room (see {@link InsufficientRoomError}).
 */
export const Frontier = {
  /**
   * @param opts - Resolved options (`seed`, `target`, `noisePoolFraction`,
   *   `seedRingDist`, `growthCap`, `playerCount`).
   * @returns A territory per nation, or
   *   `InsufficientRoom` if the map was too small for every nation to reach
   *   its target.
   */
  generate(opts: ResolvedGenerateCoordsOpts): Result.Result<Array<Array<Coords.Coords>>, InsufficientRoomError> {
    const seeds = makeSeeds(opts);
    // Start with each seed tile owned by its nation and the PRNG seeded, then
    // grow to completion.
    const initial: FrontierState = {
      map: HashMap.fromIterable(
        pipe(seeds, Array.map((seed, id) => [seed, id] as const)),
      ),
      counts: Array.makeBy(opts.playerCount, () => 1),
      seed: opts.seed >>> 0,
    };
    const final = grow(initial, opts, seeds);
    // The most-constrained growth guarantees every nation reaches its target
    // only while there is enough room. Detect the failure mode explicitly
    // instead of returning an unbalanced board.
    const short = final.counts.findIndex((count) => count < opts.target);
    if (short !== -1) {
      return Result.fail({
        _tag: "InsufficientRoom",
        nationId: short,
        actual: final.counts[short]!,
        target: opts.target,
        playerCount: opts.playerCount,
        growthCap: opts.growthCap,
        seedRingDist: opts.seedRingDist,
      });
    }
    return Result.succeed(groupTerritories(final.map, seeds, opts.playerCount));
  },
};
