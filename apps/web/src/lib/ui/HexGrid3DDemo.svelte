<script lang="ts">
import { BoardGeneration } from "@land-of-bron/game";
import { Canvas } from "@threlte/core";
import { PCFShadowMap } from "three";
import {
  axialToWorldXZ,
  NATION_BORDER_COLORS,
  NATION_COLORS,
  NATION_NAMES,
  type Tile3D,
} from "./hex3d";
import HexScene from "./HexScene.svelte";
import { TEXTURE_MODES, type TextureMode } from "./hexTextures";

// Fixed settings for this demo — ragged frontier, straight from the game
// package, with neutral tiles always shown.
const STRATEGY = "frontier" as const;
const SHOW_NEUTRAL = true;
const TARGET = 7;
const NOISE_POOL_FRACTION = 0.35;
const SEED_RING_DIST = 2;
const GROWTH_CAP = 4;
const DEFAULT_SEED = 6345;

let nationCount = $state<number>(4);
let seed = $state<number>(DEFAULT_SEED);
let hovered = $state<Tile3D | null>(null);
let mode = $state<TextureMode>("procedural");
let animateSea = $state<boolean>(true);

const board = $derived.by(() => {
  const playerCount = Math.min(7, Math.max(3, Math.round(nationCount)));
  const activeSeed = Number.isFinite(seed) ? Math.trunc(seed) : DEFAULT_SEED;

  const result = BoardGeneration.generateCoords({
    playerCount,
    strategy: STRATEGY,
    seed: activeSeed,
    target: TARGET,
    noisePoolFraction: NOISE_POOL_FRACTION,
    seedRingDist: SEED_RING_DIST,
    growthCap: GROWTH_CAP,
  });

  if (result._tag === "Failure") {
    return {
      tiles: [] as Tile3D[],
      error: `Generation failed (${result.failure._tag})`,
    };
  }

  const raw: { q: number; r: number; nationId: number | null }[] = [];
  result.success.forEach((territory, nationId) => {
    territory.forEach((cell) => {
      raw.push({ q: cell.q, r: cell.r, nationId });
    });
  });
  if (SHOW_NEUTRAL) {
    BoardGeneration.neutralCoords(result.success).forEach((cell) => {
      raw.push({ q: cell.q, r: cell.r, nationId: null });
    });
  }

  // Center the board on the origin so the camera framing is stable.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const placed = raw.map((tile) => {
    const { x, z } = axialToWorldXZ(tile.q, tile.r);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    return { tile, x, z };
  });
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const tiles: Tile3D[] = placed.map(({ tile, x, z }) => ({
    key: `${tile.q},${tile.r}`,
    q: tile.q,
    r: tile.r,
    nationId: tile.nationId,
    x: x - centerX,
    z: z - centerZ,
  }));

  return { tiles, error: null as string | null };
});

const tiles = $derived(board.tiles);
</script>

<div class="demo">
  <div class="viewport">
    <Canvas shadows={PCFShadowMap}>
      <HexScene
        {tiles}
        nationColors={NATION_COLORS}
        {mode}
        {animateSea}
        onHover={(tile) => (hovered = tile)}
      />
    </Canvas>
  </div>

  <header class="control-panel">
    <div class="control-group full">
      <span class="control-label">Surface:</span>
      <div class="segmented" role="group" aria-label="Tile surface style">
        {#each TEXTURE_MODES as option (option.id)}
          <button
            type="button"
            class="seg-btn"
            class:active={mode === option.id}
            aria-pressed={mode === option.id}
            onclick={() => (mode = option.id)}
            title={option.blurb}
          >
            {option.label}
          </button>
        {/each}
      </div>
      <span class="hint">{
        TEXTURE_MODES.find((m) => m.id === mode)?.blurb
      }</span>
    </div>

    <div class="control-group">
      <span class="control-label">Layout:</span>
      <div class="fixed-pill">4. Ragged Frontier</div>
    </div>

    <div class="control-group">
      <span class="control-label">Source:</span>
      <div class="fixed-pill">Game pkg</div>
    </div>

    <div class="control-group">
      <span class="control-label">Neutral tiles:</span>
      <div class="fixed-pill on">On</div>
    </div>

    <div class="control-group grow">
      <label for="seed">Seed:</label>
      <input
        id="seed"
        class="seed-input"
        type="number"
        min="0"
        step="1"
        bind:value={seed}
        title="Deterministic seed — the same seed with the same nation count always reproduces the same layout"
      />
      <button
        type="button"
        class="ghost-btn"
        onclick={() => (seed = DEFAULT_SEED)}
        title="Reset to the default seed ({DEFAULT_SEED})"
      >
        Default
      </button>
      <button
        type="button"
        class="ghost-btn"
        onclick={() => (seed = Math.floor(Math.random() * 100000))}
      >
        Randomize
      </button>
    </div>

    <div class="control-group">
      <label for="nations">Nations: <strong>{nationCount}</strong></label>
      <input
        id="nations"
        type="range"
        min="3"
        max="7"
        bind:value={nationCount}
      />
    </div>

    <div class="control-group">
      <label class="switch-label" for="animateSea">
        <input
          id="animateSea"
          type="checkbox"
          class="switch-input"
          bind:checked={animateSea}
        />
        <span class="switch-track"><span class="switch-thumb"></span></span>
        <span>Animate sea</span>
      </label>
    </div>
  </header>

  <footer class="status-bar">
    {#if board.error}
      <span class="error">{board.error}</span>
    {:else if hovered}
      <div>
        <strong>Coordinates:</strong>
        ({hovered.q}, {hovered.r}, {-hovered.q - hovered.r})
      </div>
      <div>
        <strong>Owner:</strong>
        {#if hovered.nationId !== null}
          <span style="color: {NATION_BORDER_COLORS[hovered.nationId]}">
            {NATION_NAMES[hovered.nationId]}
          </span>
        {:else}
          <span style="color: #64748b">Neutral Sea</span>
        {/if}
      </div>
    {:else}
      <div class="placeholder">
        Drag to orbit · scroll to zoom · hover a tile to inspect it
      </div>
    {/if}
  </footer>
</div>

<style>
.demo {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  background: #020617;
  color: #f8fafc;
  font-family: system-ui, -apple-system, sans-serif;
}

.viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  background: radial-gradient(circle at 50% 25%, #12203a 0%, #020617 70%);
}

.control-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem 1.75rem;
  padding: 0.85rem 1.5rem;
  background: #0f172a;
  border-top: 1px solid #1e293b;
  align-items: center;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.9rem;
}

.control-group.grow {
  flex: 1;
  min-width: 260px;
}

.control-group.full {
  flex: 1 1 100%;
}

.control-label {
  color: #94a3b8;
}

/* Segmented control for the experimental surface styles */
.segmented {
  display: inline-flex;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 3px;
  gap: 3px;
}

.seg-btn {
  background: transparent;
  color: #94a3b8;
  border: none;
  border-radius: 6px;
  padding: 0.35rem 0.8rem;
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  white-space: nowrap;
  font-family: inherit;
}

.seg-btn:hover {
  color: #f8fafc;
}

.seg-btn.active {
  background: #334155;
  color: #f8fafc;
}

.seg-btn:focus-visible {
  outline: 2px solid #10b981;
  outline-offset: 2px;
}

.hint {
  font-size: 0.75rem;
  color: #94a3b8;
  font-style: italic;
}

/* Toggle switch (sea animation) */
.switch-label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.9rem;
  user-select: none;
}

.switch-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-track {
  width: 34px;
  height: 18px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 999px;
  position: relative;
  flex-shrink: 0;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.switch-thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 14px;
  height: 14px;
  background: #94a3b8;
  border-radius: 50%;
  transition: transform 0.2s ease, background 0.2s ease;
}

.switch-input:checked + .switch-track {
  background: #10b981;
  border-color: #059669;
}

.switch-input:checked + .switch-track .switch-thumb {
  transform: translateX(16px);
  background: #f8fafc;
}

.switch-input:focus-visible + .switch-track {
  outline: 2px solid #10b981;
  outline-offset: 2px;
}

.fixed-pill {
  background: #1e293b;
  border: 1px solid #334155;
  color: #cbd5e1;
  border-radius: 999px;
  padding: 0.25rem 0.75rem;
  font-size: 0.82rem;
  white-space: nowrap;
  cursor: default;
}

.fixed-pill.on {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.45);
  color: #a7f3d0;
}

input[type="range"] {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 6px;
  cursor: pointer;
}

.seed-input {
  width: 6.5rem;
  background: #1e293b;
  color: #f8fafc;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
  font-size: 0.85rem;
}

.ghost-btn {
  background: #1e293b;
  color: #94a3b8;
  border: 1px solid #334155;
  padding: 0.3rem 0.65rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: background 0.15s ease, color 0.15s ease;
}

.ghost-btn:hover {
  background: #334155;
  color: #f8fafc;
}

.status-bar {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem 1.5rem;
  background: #0f172a;
  border-top: 1px solid #1e293b;
  font-size: 0.85rem;
  font-family: monospace;
}

.placeholder {
  color: #64748b;
}

.error {
  color: #fca5a5;
}
</style>
