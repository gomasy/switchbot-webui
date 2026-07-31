import type { Device, InfraredDevice } from "./types";

export type DeviceCategory =
  | "bot"
  | "plug"
  | "colorLight"
  | "ceilingLight"
  | "light"
  | "curtain"
  | "roller"
  | "relay"
  | "relay2"
  | "lock"
  | "meter"
  | "motion"
  | "contact"
  | "keypad"
  | "water"
  | "camera"
  | "remote"
  | "hub"
  | "humidifier"
  | "vacuum"
  | "purifier"
  | "fan"
  | "airConditioner"
  | "tv"
  | "unknown";

export type ControlKind =
  | "power"
  | "press"
  | "brightness"
  | "color"
  | "colorTemp"
  | "position"
  | "lock"
  | "vacuum"
  | "humidity"
  | "relayChannels";

interface CategoryInfo {
  icon: string;
  controls: ControlKind[];
}

const CATEGORIES: Record<DeviceCategory, CategoryInfo> = {
  bot: { icon: "🤖", controls: ["power", "press"] },
  plug: { icon: "🔌", controls: ["power"] },
  colorLight: {
    icon: "💡",
    controls: ["power", "brightness", "color", "colorTemp"],
  },
  ceilingLight: { icon: "💡", controls: ["power", "brightness", "colorTemp"] },
  light: { icon: "💡", controls: ["power", "brightness"] },
  curtain: { icon: "🪟", controls: ["position"] },
  roller: { icon: "🪟", controls: ["position"] },
  relay: { icon: "🔌", controls: ["power"] },
  relay2: { icon: "🔌", controls: ["relayChannels"] },
  lock: { icon: "🔒", controls: ["lock"] },
  meter: { icon: "🌡️", controls: [] },
  motion: { icon: "👁️", controls: [] },
  contact: { icon: "🚪", controls: [] },
  keypad: { icon: "🔢", controls: [] },
  water: { icon: "🚿", controls: [] },
  camera: { icon: "📷", controls: [] },
  remote: { icon: "📱", controls: [] },
  hub: { icon: "📡", controls: [] },
  humidifier: { icon: "💧", controls: ["power", "humidity"] },
  vacuum: { icon: "🧹", controls: ["vacuum"] },
  purifier: { icon: "🌬️", controls: ["power"] },
  fan: { icon: "🌀", controls: ["power"] },
  airConditioner: { icon: "❄️", controls: [] },
  tv: { icon: "📺", controls: [] },
  // Unknown types likely have controllable power
  unknown: { icon: "📱", controls: ["power"] },
};

/** Robot vacuum models whose deviceType does not contain "vacuum". */
const VACUUM_MODELS = ["k10", "k11", "k20", "s10", "s20"];

/**
 * Vacuum models that speak the newer startClean/pause command set instead of
 * start/stop. Kept next to VACUUM_MODELS so the two cannot drift: a model
 * missing from that list is never categorized as a vacuum in the first place.
 */
const ADVANCED_VACUUM_MODELS = ["s10", "s20", "k20"];

function matchesModel(deviceType: string, models: string[]): boolean {
  const dt = deviceType.toLowerCase();
  return models.some((model) => dt.includes(model));
}

export function getCategory(deviceType: string | undefined): DeviceCategory {
  if (!deviceType) return "unknown";
  const dt = deviceType.toLowerCase();
  // Check vacuum before bot ("Robot Vacuum Cleaner" partially matches "bot")
  if (dt.includes("vacuum") || matchesModel(dt, VACUUM_MODELS)) return "vacuum";
  if (dt.includes("meter") || dt.includes("thermo")) return "meter";
  if (dt.includes("motion")) return "motion";
  if (dt.includes("contact")) return "contact";
  if (dt.includes("keypad")) return "keypad";
  if (dt.includes("water")) return "water";
  if (dt.includes("cam")) return "camera";
  if (dt.includes("remote")) return "remote";
  if (dt.includes("hub")) return "hub";
  if (dt.includes("bot")) return "bot";
  if (dt.includes("plug")) return "plug";
  if (dt.includes("relay switch 2pm")) return "relay2";
  if (dt.includes("relay switch")) return "relay";
  if (dt.includes("color bulb") || dt.includes("strip")) return "colorLight";
  if (dt.includes("ceiling light")) return "ceilingLight";
  if (dt.includes("bulb") || dt.includes("light") || dt.includes("lamp"))
    return "light";
  if (dt.includes("roller shade")) return "roller";
  if (dt.includes("curtain") || dt.includes("blind")) return "curtain";
  if (dt.includes("lock")) return "lock";
  if (dt.includes("humidifier")) return "humidifier";
  if (dt.includes("purifier")) return "purifier";
  if (dt.includes("fan") || dt.includes("circulator")) return "fan";
  if (dt.includes("air conditioner")) return "airConditioner";
  if (dt.includes("tv") || dt.includes("dvd") || dt.includes("projector"))
    return "tv";
  return "unknown";
}

export function getDeviceIcon(deviceType: string | undefined): string {
  return CATEGORIES[getCategory(deviceType)].icon;
}

export function getControls(deviceType: string): ControlKind[] {
  return CATEGORIES[getCategory(deviceType)].controls;
}

export function isHub(deviceType: string): boolean {
  return getCategory(deviceType) === "hub";
}

export interface VacuumCommands {
  start: string;
  /** Undefined for the older command set, which takes no parameter. */
  startParameter?: unknown;
  stop: string;
}

/** The start/stop commands this vacuum model understands. */
export function getVacuumCommands(deviceType: string): VacuumCommands {
  if (!matchesModel(deviceType, ADVANCED_VACUUM_MODELS)) {
    return { start: "start", stop: "stop" };
  }
  // The K20 has no mop, so its parameter carries no water level.
  const param = matchesModel(deviceType, ["k20"])
    ? { fanLevel: 1, times: 1 }
    : { fanLevel: 1, waterLevel: 1, times: 1 };
  return {
    start: "startClean",
    startParameter: { action: "sweep", param },
    stop: "pause",
  };
}

/** Return deviceType for physical devices, remoteType for infrared devices. */
export function getTypeLabel(device: Device | InfraredDevice): string {
  return "remoteType" in device ? device.remoteType : device.deviceType;
}
