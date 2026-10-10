<script lang="ts">
import { T, useTask, useThrelte } from "@threlte/core";
import { OrbitControls } from "@threlte/extras";
import {
  type CanvasTexture,
  type DirectionalLight,
  type Mesh,
  MeshPhysicalMaterial,
  type PointLight,
  Raycaster,
  type SpotLight,
  Vector2,
} from "three";
import {
  HEX_RADIUS,
  SEA_COLOR,
  type Tile3D,
  TILE_HEIGHT,
  tintHex,
} from "./hex3d";
import {
  artIndexFor,
  cachedPrintArt,
  createCardboard,
  createMaterialBundle,
  createPhotoBundle,
  createPrintBundle,
  createProceduralBundle,
  createStylizedBundle,
  createTableTextures,
  isPrintMode,
  type LabMode,
  loadPrintArt,
  type PrintMode,
  setPrintRepeat,
  setVignette,
  SUBSTRATES,
  type TableKind,
  type TextureBundle,
  type TextureMode,
} from "./hexTextures";
import HexTileMaterial from "./HexTileMaterial.svelte";
import {
  type EnvironmentConfig,
  type LightConfig,
  lightPosition,
} from "./lighting";

let {
  tiles,
  nationColors,
  mode,
  animateSea,
  printScale,
  relief,
  vignette,
  table,
  lights,
  environment,
  onHover,
}: {
  tiles: Tile3D[];
  nationColors: readonly string[];
  mode: TextureMode;
  animateSea: boolean;
  printScale: number;
  relief: number;
  vignette: number;
  table: TableKind;
  lights: LightConfig[];
  environment: EnvironmentConfig;
  onHover?: (tile: Tile3D | null) => void;
} = $props();

// Key of the tile currently under the pointer (drives the lift + glow).
let hoveredKey = $state<string | null>(null);

// Registered tile meshes, used as raycast targets.
const meshes: Mesh[] = [];
const raycaster = new Raycaster();
const pointer = new Vector2();
let pointerActive = false;

const { camera, dom, scene } = useThrelte();

// --- Texture bundles -------------------------------------------------------
// The asset-free looks are cheap, so build them up front. The photo look and
// the printed substrates pull committed textures, so they are built lazily on
// first use and then cached.
const staticBundles: Record<Exclude<LabMode, "photo">, TextureBundle> = {
  procedural: createProceduralBundle(),
  stylized: createStylizedBundle(),
  material: createMaterialBundle(),
};

let photoBundle = $state<TextureBundle | null>(null);
$effect(() => {
  if (mode === "photo" && photoBundle === null) {
    photoBundle = createPhotoBundle();
  }
});

const printBundles = new Map<PrintMode, TextureBundle>();
function printBundleFor(id: PrintMode): TextureBundle {
  let bundle = printBundles.get(id);
  if (!bundle) {
    bundle = createPrintBundle(id);
    printBundles.set(id, bundle);
  }
  return bundle;
}

// The printed terrain art is baked per substrate and per zoom: the relief maps
// retune immediately, then the printed face is rebaked once the slider settles.
let artTextures = $state<CanvasTexture[] | null>(null);
$effect(() => {
  const active = mode;
  const repeat = printScale;
  if (!isPrintMode(active)) {
    artTextures = null;
    return;
  }
  setPrintRepeat(active, repeat);
  const cached = cachedPrintArt(active, repeat);
  if (cached) {
    artTextures = cached;
    return;
  }
  artTextures = null;
  const timer = setTimeout(() => {
    void loadPrintArt(active, repeat).then((textures) => {
      if (mode === active) artTextures = textures;
    });
  }, 140);
  return () => clearTimeout(timer);
});

const activeBundle = $derived(
  mode === "photo"
    ? (photoBundle ?? staticBundles.procedural)
    : isPrintMode(mode)
    ? printBundleFor(mode)
    : staticBundles[mode],
);

// Remount the material whenever the map set changes (mode switches, or the
// textures finish being created) so three rebuilds the shader.
const materialKey = $derived(
  mode === "photo" && photoBundle === null
    ? "photo-loading"
    : isPrintMode(mode) && artTextures === null
    ? `${mode}-loading`
    : mode,
);

// Reflection environment is only used by the material-only look.
$effect(() => {
  scene.environment = activeBundle.environment;
});

$effect(() => {
  setVignette(vignette);
});

// Kraft-cardboard material shared by every tile's cut sides.
const cardboard = createCardboard();
const cardboardMaterial = new MeshPhysicalMaterial({
  map: cardboard.map,
  bumpMap: cardboard.bumpMap,
  bumpScale: 0.015,
  roughness: 0.95,
  metalness: 0,
});

// Tabletop veneers; the active set is swapped by the table selector.
const tableTextures = createTableTextures();
const tableMaps = $derived(tableTextures[table]);
const TABLE_SIZE = 34;
const TABLE_THICKNESS = 1.4;

// --- Interaction -----------------------------------------------------------

// Track the pointer in normalized device coordinates.
$effect(() => {
  const onMove = (event: PointerEvent) => {
    const rect = dom.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    pointerActive = true;
  };
  const onLeave = () => {
    pointerActive = false;
    if (hoveredKey !== null) {
      hoveredKey = null;
      onHover?.(null);
    }
  };
  dom.addEventListener("pointermove", onMove);
  dom.addEventListener("pointerleave", onLeave);
  return () => {
    dom.removeEventListener("pointermove", onMove);
    dom.removeEventListener("pointerleave", onLeave);
  };
});

// Raycast once per frame; only notify when the hovered tile changes.
useTask(() => {
  if (!pointerActive) return;
  raycaster.setFromCamera(pointer, camera.current);
  const hit = raycaster.intersectObjects(meshes, false)[0];
  const key = hit ? (hit.object.userData.tile as Tile3D).key : null;
  if (key !== hoveredKey) {
    hoveredKey = key;
    onHover?.(hit ? (hit.object.userData.tile as Tile3D) : null);
  }
});

// Scroll the sea's bump/normal texture for a moving-water effect.
useTask((delta) => {
  if (!animateSea) return;
  const texture = activeBundle.sea.animated;
  if (!texture) return;
  texture.offset.x = (texture.offset.x + delta * 0.025) % 1;
  texture.offset.y = (texture.offset.y + delta * 0.018) % 1;
});

/** Give every shadow-casting light a tight, board-sized shadow frustum. */
function setupShadow(light: DirectionalLight | PointLight | SpotLight): void {
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.0006;
  const cam = light.shadow.camera;
  if ("left" in cam) {
    cam.left = -22;
    cam.right = 22;
    cam.top = 22;
    cam.bottom = -22;
    cam.near = 1;
    cam.far = 90;
    cam.updateProjectionMatrix();
  }
}

function registerMesh(ref: Mesh): () => void {
  meshes.push(ref);
  return () => {
    const index = meshes.indexOf(ref);
    if (index >= 0) meshes.splice(index, 1);
  };
}
</script>

<T.PerspectiveCamera
  makeDefault
  position={[0, 15, 16]}
  fov={42}
  near={0.1}
  far={250}
/>

<OrbitControls
  enableDamping
  dampingFactor={0.08}
  minDistance={7}
  maxDistance={45}
  maxPolarAngle={Math.PI / 2.1}
  target={[0, 0, 0]}
/>

<T.AmbientLight intensity={environment.ambient} />
<T.HemisphereLight
  args={[environment.skyColor, environment.groundColor, environment.hemisphere]}
/>

{#each lights as light (light.id)}
  {#if light.enabled}
    {#if light.type === "directional"}
      <T.DirectionalLight
        position={lightPosition(light)}
        color={light.color}
        intensity={light.intensity}
        castShadow={light.castShadow}
        oncreate={setupShadow}
      />
    {:else if light.type === "point"}
      <T.PointLight
        position={lightPosition(light)}
        color={light.color}
        intensity={light.intensity}
        decay={0}
        oncreate={setupShadow}
      />
    {:else}
      <T.SpotLight
        position={lightPosition(light)}
        color={light.color}
        intensity={light.intensity}
        decay={0}
        angle={(light.angle * Math.PI) / 180}
        penumbra={light.penumbra}
        castShadow={light.castShadow}
        oncreate={setupShadow}
      />
    {/if}
  {/if}
{/each}

<!-- Wooden tabletop the board sits on. -->
<T.Mesh
  position={[0, -TABLE_THICKNESS / 2, 0]}
  receiveShadow
>
  <T.BoxGeometry args={[TABLE_SIZE, TABLE_THICKNESS, TABLE_SIZE]} />
  <T.MeshPhysicalMaterial
    map={tableMaps.map}
    normalMap={tableMaps.normalMap}
    normalScale={1}
    roughnessMap={tableMaps.roughnessMap}
    roughness={1}
    metalness={0}
    clearcoat={0.3}
    clearcoatRoughness={0.35}
    envMapIntensity={0.4}
  />
</T.Mesh>

{#each tiles as tile (tile.key)}
  {@const isSea = tile.nationId === null}
  {@const hovered = hoveredKey === tile.key}
  {@const height = TILE_HEIGHT}
  {@const recipe = isSea ? activeBundle.sea : activeBundle.land}
  {@const baseColor = isSea
  ? (recipe.baseColor ?? SEA_COLOR)
  : (nationColors[tile.nationId! % nationColors.length] ?? SEA_COLOR)}
  {@const color = tintHex(baseColor, recipe.tint)}
  {@const artMap = isPrintMode(mode) && !isSea && artTextures
  ? (artTextures[artIndexFor(tile.q, tile.r, artTextures.length)] ?? null)
  : null}
  {@const lift = hovered ? (isSea ? 0.06 : 0.18) : 0}
  <T.Mesh
    position={[tile.x, height / 2 + lift, tile.z]}
    material={cardboardMaterial}
    castShadow
    receiveShadow
  >
    <!-- Cardboard body: open-ended so only the cut sides show. -->
    <T.CylinderGeometry args={[HEX_RADIUS, HEX_RADIUS, height, 6, 1, true]} />
    <!-- Linen-printed top face, and the raycast target. -->
    <T.Mesh
      position={[0, height / 2, 0]}
      userData={{ tile }}
      castShadow
      receiveShadow
      oncreate={(ref) => registerMesh(ref)}
    >
      <T.CylinderGeometry args={[HEX_RADIUS, HEX_RADIUS, 0.004, 6]} />
      <HexTileMaterial
        {recipe}
        {color}
        {hovered}
        variant={materialKey}
        {artMap}
        normalScaleOverride={isPrintMode(mode)
        ? SUBSTRATES[mode].normalScale * relief
        : null}
      />
    </T.Mesh>
  </T.Mesh>
{/each}
