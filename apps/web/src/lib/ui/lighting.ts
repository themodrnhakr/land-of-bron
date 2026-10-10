/**
 * Lighting rig for the 3D demo.
 *
 * Lights are plain data so the settings panel can edit them and the scene can
 * render them generically: any number of lights, each with a type, colour,
 * brightness and a spherical position around the board.
 *
 * Point and spot lights are rendered with `decay = 0` so their brightness
 * slider behaves like the sun's — otherwise the inverse-square falloff would
 * make a "2.2" point light essentially invisible at board scale.
 */

export type LightType = "directional" | "point" | "spot";

export interface LightConfig {
  id: string;
  name: string;
  enabled: boolean;
  type: LightType;
  color: string;
  intensity: number;
  /** Degrees around Y. 0 points at the camera, 180 behind the board. */
  azimuth: number;
  /** Degrees above the horizon. */
  elevation: number;
  /** Radius from the board centre — the real distance for point & spot. */
  distance: number;
  castShadow: boolean;
  /** Spot cone half-angle, in degrees. Spot lights only. */
  angle: number;
  /** Spot edge softness (0–1). Spot lights only. */
  penumbra: number;
}

export const LIGHT_TYPES: { id: LightType; label: string }[] = [
  { id: "directional", label: "Sun" },
  { id: "point", label: "Point" },
  { id: "spot", label: "Spot" },
];

export const MAX_LIGHTS = 5;

const LIGHT_NAMES = ["Key", "Fill", "Rim", "Bounce", "Extra"];

/** Ambient + hemisphere fill, i.e. everything that is not a placed light. */
export interface EnvironmentConfig {
  ambient: number;
  hemisphere: number;
  skyColor: string;
  groundColor: string;
}

export const DEFAULT_ENVIRONMENT: EnvironmentConfig = {
  ambient: 0.6,
  hemisphere: 0.7,
  skyColor: "#bfdbfe",
  groundColor: "#020617",
};

/** A neutral sun that reproduces the original demo look. */
export function makeLight(index: number, partial: Partial<LightConfig> = {}): LightConfig {
  return {
    id: `light-${index}-${Math.random().toString(36).slice(2, 7)}`,
    name: LIGHT_NAMES[index] ?? `Light ${index + 1}`,
    enabled: true,
    type: "directional",
    color: "#ffffff",
    intensity: 1.8,
    azimuth: 50,
    elevation: 52,
    distance: 28,
    castShadow: index === 0,
    angle: 35,
    penumbra: 0.4,
    ...partial,
  };
}

export function createDefaultLights(): LightConfig[] {
  return [
    makeLight(0, {
      color: "#fff5e6",
      intensity: 2.2,
      azimuth: 50,
      elevation: 52,
      distance: 28,
      castShadow: true,
    }),
  ];
}

/** Spherical position for a light, in world units. */
export function lightPosition(light: LightConfig): [number, number, number] {
  const az = (light.azimuth * Math.PI) / 180;
  const el = (light.elevation * Math.PI) / 180;
  const horizontal = light.distance * Math.cos(el);
  return [horizontal * Math.sin(az), light.distance * Math.sin(el), horizontal * Math.cos(az)];
}

/** Point lights cannot cast a useful shadow at this scale, so they never do. */
export function canCastShadow(light: LightConfig): boolean {
  return light.type !== "point";
}
