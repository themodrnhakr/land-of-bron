<script lang="ts">
import { T, useTask, useThrelte } from "@threlte/core";
import { OrbitControls } from "@threlte/extras";
import { type Mesh, Raycaster, Vector2 } from "three";
import {
  HEX_RADIUS,
  NATION_HEIGHT,
  SEA_COLOR,
  SEA_HEIGHT,
  type Tile3D,
} from "./hex3d";

let {
  tiles,
  nationColors,
  onHover,
}: {
  tiles: Tile3D[];
  nationColors: readonly string[];
  onHover?: (tile: Tile3D | null) => void;
} = $props();

// Key of the tile currently under the pointer (drives the lift + glow).
let hoveredKey = $state<string | null>(null);

// Registered tile meshes, used as raycast targets.
const meshes: Mesh[] = [];
const raycaster = new Raycaster();
const pointer = new Vector2();
let pointerActive = false;

const { camera, dom } = useThrelte();

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

<T.AmbientLight intensity={0.6} />
<T.HemisphereLight args={["#bfdbfe", "#020617", 0.7]} />
<T.DirectionalLight
  castShadow
  position={[13, 22, 11]}
  intensity={2.2}
  oncreate={(light) => {
    light.shadow.mapSize.set(2048, 2048);
    const shadowCam = light.shadow.camera;
    shadowCam.left = -20;
    shadowCam.right = 20;
    shadowCam.top = 20;
    shadowCam.bottom = -20;
    shadowCam.near = 1;
    shadowCam.far = 80;
    shadowCam.updateProjectionMatrix();
  }}
/>

<!-- Ground disc so the board casts readable shadows. -->
<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
  <T.CircleGeometry args={[34, 64]} />
  <T.MeshStandardMaterial color="#0a1120" roughness={1} metalness={0} />
</T.Mesh>

{#each tiles as tile (tile.key)}
  {@const isSea = tile.nationId === null}
  {@const hovered = hoveredKey === tile.key}
  {@const height = isSea ? SEA_HEIGHT : NATION_HEIGHT}
  {@const color = isSea
  ? SEA_COLOR
  : nationColors[tile.nationId! % nationColors.length]}
  {@const lift = hovered ? (isSea ? 0.06 : 0.18) : 0}
  <T.Mesh
    position={[tile.x, height / 2 + lift, tile.z]}
    userData={{ tile }}
    castShadow
    receiveShadow
    oncreate={(ref) => registerMesh(ref)}
  >
    <T.CylinderGeometry args={[HEX_RADIUS, HEX_RADIUS, height, 6]} />
    <T.MeshStandardMaterial
      color={color}
      roughness={isSea ? 0.95 : 0.5}
      metalness={isSea ? 0.05 : 0.18}
      emissive={hovered ? color : "#000000"}
      emissiveIntensity={hovered ? 0.5 : 0}
    />
  </T.Mesh>
{/each}
