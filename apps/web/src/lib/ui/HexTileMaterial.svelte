<script lang="ts">
import { T } from "@threlte/core";
import type { MeshPhysicalMaterial, Texture } from "three";
import { attachTileVignette, type SurfaceRecipe } from "./hexTextures";

let {
  recipe,
  color,
  hovered,
  variant,
  artMap = null,
  normalScaleOverride = null,
}: {
  recipe: SurfaceRecipe;
  color: string;
  hovered: boolean;
  /** Changes whenever the active texture bundle changes (mode / load state). */
  variant: string;
  /** Per-tile printed art (linen mode); overrides the recipe's albedo. */
  artMap?: Texture | null;
  /** Live normal-strength override (linen depth slider). */
  normalScaleOverride?: number | null;
} = $props();

const emissive = $derived(hovered ? color : "#000000");
const emissiveIntensity = $derived(hovered ? 0.5 : 0);

// A single physical material is used for every surface style: it is a superset
// of the standard material, so keeping one live instance avoids remounting (and
// the attach races that come with it) when the mode changes.
let mat = $state<MeshPhysicalMaterial>();

// three does not recompile a shader when a map slot changes at runtime, so bump
// the material version whenever the active recipe (map set) changes.
$effect(() => {
  void variant;
  void recipe;
  void artMap;
  if (mat) {
    attachTileVignette(mat);
    mat.needsUpdate = true;
  }
});
</script>

<T.MeshPhysicalMaterial
  bind:ref={mat}
  {color}
  map={artMap ?? recipe.map}
  normalMap={recipe.normalMap}
  normalScale={normalScaleOverride ?? recipe.normalScale}
  bumpMap={recipe.bumpMap}
  bumpScale={recipe.bumpScale}
  roughnessMap={recipe.roughnessMap}
  roughness={recipe.roughness}
  metalness={recipe.metalness}
  clearcoat={recipe.clearcoat}
  clearcoatRoughness={recipe.clearcoatRoughness}
  envMapIntensity={recipe.envMapIntensity}
  {emissive}
  {emissiveIntensity}
/>
