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
import {
  isPrintMode,
  modeInfo,
  type PrintMode,
  SUBSTRATES,
  TABLE_KINDS,
  type TableKind,
  TEXTURE_MODES,
  type TextureMode,
} from "./hexTextures";
import {
  canCastShadow,
  createDefaultLights,
  DEFAULT_ENVIRONMENT,
  type EnvironmentConfig,
  LIGHT_TYPES,
  type LightConfig,
  type LightType,
  makeLight,
  MAX_LIGHTS,
} from "./lighting";

// Fixed settings for this demo — ragged frontier, straight from the game
// package, with neutral tiles always shown.
const STRATEGY = "frontier" as const;
const SHOW_NEUTRAL = true;
const TARGET = 7;
const NOISE_POOL_FRACTION = 0.35;
const SEED_RING_DIST = 2;
const GROWTH_CAP = 4;

const DEFAULTS = {
  nationCount: 4,
  seed: 6345,
  mode: "hessian" as TextureMode,
  animateSea: true,
  relief: 1,
  vignette: 0.35,
  table: "wood_table" as TableKind,
};

type Tab = "board" | "surface" | "light";

let tab = $state<Tab>("surface");
let menuOpen = $state<boolean>(false);

// --- Board ---------------------------------------------------------------
let nationCount = $state<number>(DEFAULTS.nationCount);
let seed = $state<number>(DEFAULTS.seed);

// --- Surface -------------------------------------------------------------
let mode = $state<TextureMode>(DEFAULTS.mode);
let printScale = $state<number>(
  isPrintMode(DEFAULTS.mode) ? SUBSTRATES[DEFAULTS.mode].repeat : 0.4,
);
let relief = $state<number>(DEFAULTS.relief);
let vignette = $state<number>(DEFAULTS.vignette);
let animateSea = $state<boolean>(DEFAULTS.animateSea);
let table = $state<TableKind>(DEFAULTS.table);

// --- Lighting ------------------------------------------------------------
const initialLights = createDefaultLights();
let lights = $state<LightConfig[]>(initialLights);
let environment = $state<EnvironmentConfig>({ ...DEFAULT_ENVIRONMENT });
let activeLightId = $state<string>(firstLightId(initialLights));

let hovered = $state<Tile3D | null>(null);
const printedModes = TEXTURE_MODES.filter((m) => m.group === "printed");
const labModes = TEXTURE_MODES.filter((m) => m.group === "lab");

function firstLightId(list: LightConfig[]): string {
  return list[0]?.id ?? "";
}

function selectMode(next: TextureMode): void {
  mode = next;
  // Each substrate has its own natural zoom; reset the slider to match.
  if (isPrintMode(next)) printScale = SUBSTRATES[next].repeat;
}

function resetAll(): void {
  nationCount = DEFAULTS.nationCount;
  seed = DEFAULTS.seed;
  selectMode(DEFAULTS.mode);
  relief = DEFAULTS.relief;
  vignette = DEFAULTS.vignette;
  animateSea = DEFAULTS.animateSea;
  table = DEFAULTS.table;
  lights = createDefaultLights();
  activeLightId = firstLightId(lights);
  environment = { ...DEFAULT_ENVIRONMENT };
}

function addLight(): void {
  if (lights.length >= MAX_LIGHTS) return;
  const light = makeLight(lights.length);
  lights.push(light);
  activeLightId = light.id;
}

function removeLight(id: string): void {
  if (lights.length <= 1) return;
  const index = lights.findIndex((l) => l.id === id);
  if (index < 0) return;
  lights.splice(index, 1);
  if (activeLightId === id) activeLightId = firstLightId(lights);
}

// Close the settings pop-over with Escape, or when clicking outside it.
$effect(() => {
  if (!menuOpen) return;
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") menuOpen = false;
  };
  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && !target.closest(".settings-panel, .settings-toggle")) {
      menuOpen = false;
    }
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("pointerdown", onPointerDown);
  return () => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("pointerdown", onPointerDown);
  };
});

const board = $derived.by(() => {
  const playerCount = Math.min(7, Math.max(3, Math.round(nationCount)));
  const activeSeed = Number.isFinite(seed) ? Math.trunc(seed) : DEFAULTS.seed;

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
        {printScale}
        {relief}
        {vignette}
        {table}
        {lights}
        {environment}
        onHover={(tile) => (hovered = tile)}
      />
    </Canvas>
  </div>

  <button
    type="button"
    class="settings-toggle"
    class:open={menuOpen}
    aria-expanded={menuOpen}
    aria-controls="settings-panel"
    onclick={() => (menuOpen = !menuOpen)}
  >
    <span class="settings-icon" aria-hidden="true">⚙</span>
    Settings
  </button>

  {#if menuOpen}
    <section class="settings-panel" id="settings-panel" aria-label="Settings">
      <header class="panel-head">
        <h2>Settings</h2>
        <button type="button" class="ghost-btn" onclick={resetAll}>
          Reset all
        </button>
      </header>

      <div class="tabs" role="tablist" aria-label="Settings sections">
        {#each [["board", "Board"], ["surface", "Surface"], ["light", "Lighting"]] as [id, label] (id)}
          <button
            type="button"
            role="tab"
            class="tab"
            class:active={tab === id}
            aria-selected={tab === id}
            onclick={() => (tab = id as Tab)}
          >
            {label}
          </button>
        {/each}
      </div>

      <div class="panel-body">
        {#if tab === "board"}
          <div class="field">
            <label for="nations">Nations <b>{nationCount}</b></label>
            <input
              id="nations"
              type="range"
              min="3"
              max="7"
              bind:value={nationCount}
            />
          </div>

          <div class="field">
            <label for="seed">Seed</label>
            <div class="row">
              <input
                id="seed"
                class="seed-input"
                type="number"
                min="0"
                step="1"
                bind:value={seed}
              />
              <button
                type="button"
                class="ghost-btn"
                onclick={() => (seed = DEFAULTS.seed)}
                title="Back to the default seed ({DEFAULTS.seed})"
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
          </div>

          <div class="locked">
            <span class="locked-title">Fixed for this demo</span>
            <span class="fixed-pill">4 · Ragged Frontier</span>
            <span class="fixed-pill">Game pkg</span>
            <span class="fixed-pill on">Neutral tiles on</span>
          </div>
        {:else if tab === "surface"}
          <div class="group">
            <span class="group-label">Printed substrate</span>
            <div class="segmented">
              {#each printedModes as option (option.id)}
                <button
                  type="button"
                  class="seg-btn"
                  class:active={mode === option.id}
                  aria-pressed={mode === option.id}
                  onclick={() => selectMode(option.id)}
                  title={option.blurb}
                >
                  {option.label}
                </button>
              {/each}
            </div>
          </div>

          <div class="group">
            <span class="group-label">Lab looks</span>
            <div class="segmented">
              {#each labModes as option (option.id)}
                <button
                  type="button"
                  class="seg-btn"
                  class:active={mode === option.id}
                  aria-pressed={mode === option.id}
                  onclick={() => selectMode(option.id)}
                  title={option.blurb}
                >
                  {option.label}
                </button>
              {/each}
            </div>
          </div>

          <p class="hint">{modeInfo(mode)?.blurb}</p>

          {#if isPrintMode(mode)}
            <div class="field">
              <label for="printScale">Print scale <b>{
                  printScale.toFixed(2)
                }</b></label>
              <input
                id="printScale"
                type="range"
                min="0.1"
                max="3"
                step="0.05"
                bind:value={printScale}
              />
            </div>

            <div class="field">
              <label for="relief">Relief <b>{relief.toFixed(2)}×</b></label>
              <input
                id="relief"
                type="range"
                min="0"
                max="3"
                step="0.05"
                bind:value={relief}
              />
            </div>

            <div class="field">
              <label for="vignette">Vignette <b>{
                  vignette.toFixed(2)
                }</b></label>
              <input
                id="vignette"
                type="range"
                min="0"
                max="0.8"
                step="0.05"
                bind:value={vignette}
              />
            </div>
          {/if}

          <div class="field">
            <span class="field-label">Sea</span>
            <label class="switch-label">
              <input
                type="checkbox"
                class="switch-input"
                bind:checked={animateSea}
              />
              <span class="switch-track"><span
                  class="switch-thumb"
                ></span></span>
              <span>Animate ripple</span>
            </label>
          </div>

          <div class="divider"></div>

          <div class="group">
            <span class="group-label">Table</span>
            <div class="segmented">
              {#each TABLE_KINDS as option (option.id)}
                <button
                  type="button"
                  class="seg-btn"
                  class:active={table === option.id}
                  aria-pressed={table === option.id}
                  onclick={() => (table = option.id)}
                >
                  {option.label}
                </button>
              {/each}
            </div>
          </div>
        {:else}
          <div class="group">
            <span class="group-label">Lights</span>
            <div class="chips">
              {#each lights as light (light.id)}
                <button
                  type="button"
                  class="chip"
                  class:active={light.id === activeLightId}
                  class:off={!light.enabled}
                  onclick={() => (activeLightId = light.id)}
                >
                  <span
                    class="chip-dot"
                    style="background: {light.color}"
                  ></span>
                  {light.name}
                </button>
              {/each}
              {#if lights.length < MAX_LIGHTS}
                <button
                  type="button"
                  class="chip add"
                  onclick={addLight}
                  title="Add a light"
                >
                  +
                </button>
              {/if}
            </div>
          </div>

          {#each lights as light (light.id)}
            {#if light.id === activeLightId}
              <div class="light-editor">
                <div class="field">
                  <span class="field-label">Type</span>
                  <div class="segmented">
                    {#each LIGHT_TYPES as option (option.id)}
                      <button
                        type="button"
                        class="seg-btn"
                        class:active={light.type === option.id}
                        aria-pressed={light.type === option.id}
                        onclick={() => (light.type = option.id as LightType)}
                      >
                        {option.label}
                      </button>
                    {/each}
                  </div>
                </div>

                <div class="field">
                  <label for="light-enabled">On</label>
                  <label class="switch-label">
                    <input
                      id="light-enabled"
                      type="checkbox"
                      class="switch-input"
                      bind:checked={light.enabled}
                    />
                    <span class="switch-track"><span
                        class="switch-thumb"
                      ></span></span>
                    <span>{light.enabled ? "Enabled" : "Disabled"}</span>
                  </label>
                </div>

                <div class="field">
                  <label for="light-color">Colour</label>
                  <div class="row">
                    <input
                      id="light-color"
                      type="color"
                      bind:value={light.color}
                    />
                    <span class="swatch-label">{light.color}</span>
                  </div>
                </div>

                <div class="field">
                  <label for="light-intensity">Brightness <b>{
                      light.intensity.toFixed(2)
                    }</b></label>
                  <input
                    id="light-intensity"
                    type="range"
                    min="0"
                    max="6"
                    step="0.05"
                    bind:value={light.intensity}
                  />
                </div>

                <div class="field">
                  <label for="light-azimuth">Azimuth <b>{
                        light.azimuth
                      }°</b></label>
                  <input
                    id="light-azimuth"
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    bind:value={light.azimuth}
                  />
                </div>

                <div class="field">
                  <label for="light-elevation">Elevation <b>{
                        light.elevation
                      }°</b></label>
                  <input
                    id="light-elevation"
                    type="range"
                    min="1"
                    max="89"
                    step="1"
                    bind:value={light.elevation}
                  />
                </div>

                <div class="field">
                  <label for="light-distance">Distance <b>{
                      light.distance
                    }</b></label>
                  <input
                    id="light-distance"
                    type="range"
                    min="6"
                    max="60"
                    step="1"
                    bind:value={light.distance}
                  />
                </div>

                {#if light.type === "spot"}
                  <div class="field">
                    <label for="light-angle">Cone <b>{light.angle}°</b></label>
                    <input
                      id="light-angle"
                      type="range"
                      min="5"
                      max="80"
                      step="1"
                      bind:value={light.angle}
                    />
                  </div>

                  <div class="field">
                    <label for="light-penumbra">Softness <b>{
                        light.penumbra.toFixed(2)
                      }</b></label>
                    <input
                      id="light-penumbra"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      bind:value={light.penumbra}
                    />
                  </div>
                {/if}

                <div class="field">
                  <span class="field-label">Shadow</span>
                  {#if canCastShadow(light)}
                    <label class="switch-label">
                      <input
                        type="checkbox"
                        class="switch-input"
                        bind:checked={light.castShadow}
                      />
                      <span class="switch-track"><span
                          class="switch-thumb"
                        ></span></span>
                      <span>{light.castShadow ? "Casting" : "Off"}</span>
                    </label>
                  {:else}
                    <span class="note"
                    >Point lights don't cast shadows here</span>
                  {/if}
                </div>

                <button
                  type="button"
                  class="ghost-btn danger"
                  disabled={lights.length <= 1}
                  onclick={() => removeLight(light.id)}
                >
                  Remove this light
                </button>
              </div>
            {/if}
          {/each}

          <div class="divider"></div>

          <div class="group">
            <span class="group-label">Environment</span>
          </div>

          <div class="field">
            <label for="ambient">Ambient <b>{
                environment.ambient.toFixed(2)
              }</b></label>
            <input
              id="ambient"
              type="range"
              min="0"
              max="2"
              step="0.05"
              bind:value={environment.ambient}
            />
          </div>

          <div class="field">
            <label for="hemisphere">Sky fill <b>{
                environment.hemisphere.toFixed(2)
              }</b></label>
            <input
              id="hemisphere"
              type="range"
              min="0"
              max="2"
              step="0.05"
              bind:value={environment.hemisphere}
            />
          </div>

          <div class="field">
            <label for="sky-color">Sky tint</label>
            <div class="row">
              <input
                id="sky-color"
                type="color"
                bind:value={environment.skyColor}
              />
              <span class="swatch-label">{environment.skyColor}</span>
            </div>
          </div>

          <div class="field">
            <label for="ground-color">Ground tint</label>
            <div class="row">
              <input
                id="ground-color"
                type="color"
                bind:value={environment.groundColor}
              />
              <span class="swatch-label">{environment.groundColor}</span>
            </div>
          </div>
        {/if}
      </div>
    </section>
  {/if}

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
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: #020617;
  color: #f8fafc;
  font-family: system-ui, -apple-system, sans-serif;
}

.viewport {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 25%, #12203a 0%, #020617 70%);
}

/* Floating settings button */
.settings-toggle {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.5rem 0.9rem;
  background: rgba(15, 23, 42, 0.9);
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 999px;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition: background 0.15s ease, border-color 0.15s ease;
}

.settings-toggle:hover {
  background: #1e293b;
}

.settings-toggle.open {
  background: #334155;
  border-color: #10b981;
}

.settings-icon {
  font-size: 1rem;
  line-height: 1;
}

/* Pop-over panel */
.settings-panel {
  position: absolute;
  top: 3.75rem;
  right: 1rem;
  z-index: 20;
  width: min(92vw, 430px);
  max-height: calc(100vh - 5rem);
  display: flex;
  flex-direction: column;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid #1e293b;
  border-radius: 12px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
  overflow: hidden;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1.1rem 0.6rem;
}

.panel-head h2 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0 1.1rem;
  border-bottom: 1px solid #1e293b;
}

.tab {
  flex: 1 1 0;
  padding: 0.5rem 0.4rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #94a3b8;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.tab:hover {
  color: #e2e8f0;
}

.tab.active {
  color: #f8fafc;
  border-bottom-color: #10b981;
}

.tab:focus-visible {
  outline: 2px solid #10b981;
  outline-offset: -2px;
}

.panel-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.95rem 1.1rem 1.15rem;
  overflow-y: auto;
}

/* One labelled setting: fixed label column, control on the right. */
.field {
  display: grid;
  grid-template-columns: 6.2rem 1fr;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
}

.field > label,
.field-label {
  color: #94a3b8;
}

.field b {
  color: #e2e8f0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.group-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #64748b;
}

.divider {
  height: 1px;
  background: #1e293b;
  margin: 0.15rem 0;
}

.hint {
  margin: 0;
  font-size: 0.75rem;
  color: #94a3b8;
  font-style: italic;
}

.note {
  font-size: 0.75rem;
  color: #64748b;
}

.locked {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.2rem;
}

.locked-title {
  flex: 1 1 100%;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #64748b;
}

/* Segmented controls */
.segmented {
  display: flex;
  flex-wrap: wrap;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 3px;
  gap: 3px;
}

.seg-btn {
  flex: 1 1 auto;
  text-align: center;
  background: transparent;
  color: #94a3b8;
  border: none;
  border-radius: 6px;
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease;
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

/* Light chips */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.32rem 0.7rem;
  background: #1e293b;
  color: #cbd5e1;
  border: 1px solid #334155;
  border-radius: 999px;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.chip:hover {
  background: #273449;
}

.chip.active {
  border-color: #10b981;
  background: #273449;
}

.chip.off {
  opacity: 0.45;
}

.chip-dot {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.35);
}

.chip.add {
  padding: 0.32rem 0.65rem;
  font-size: 0.9rem;
  line-height: 1;
  color: #94a3b8;
}

.light-editor {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.75rem 0.8rem;
  background: rgba(30, 41, 59, 0.45);
  border: 1px solid #1e293b;
  border-radius: 10px;
}

input[type="range"] {
  width: 100%;
  min-width: 5rem;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 6px;
  cursor: pointer;
}

input[type="color"] {
  width: 2.4rem;
  height: 1.7rem;
  padding: 0;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 6px;
  cursor: pointer;
}

.swatch-label {
  font-family: monospace;
  font-size: 0.75rem;
  color: #94a3b8;
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
  font-size: 0.78rem;
  font-family: inherit;
  transition: background 0.15s ease, color 0.15s ease;
}

.ghost-btn:hover:not(:disabled) {
  background: #334155;
  color: #f8fafc;
}

.ghost-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ghost-btn.danger {
  align-self: flex-start;
  color: #fca5a5;
  border-color: rgba(248, 113, 113, 0.35);
}

.ghost-btn.danger:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.15);
  color: #fecaca;
}

/* Toggle switch */
.switch-label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.85rem;
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
  padding: 0.25rem 0.7rem;
  font-size: 0.78rem;
  white-space: nowrap;
  cursor: default;
}

.fixed-pill.on {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.45);
  color: #a7f3d0;
}

.status-bar {
  position: absolute;
  left: 1rem;
  bottom: 1rem;
  z-index: 20;
  display: flex;
  gap: 1.25rem;
  max-width: calc(100% - 2rem);
  padding: 0.5rem 0.85rem;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid #1e293b;
  border-radius: 10px;
  font-size: 0.82rem;
  font-family: monospace;
  backdrop-filter: blur(6px);
  pointer-events: none;
}

.placeholder {
  color: #64748b;
}

.error {
  color: #fca5a5;
}
</style>
