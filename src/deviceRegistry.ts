import type { Device, InfraredDevice } from "./types";

export type DeviceCategory =
  | "bot"
  | "plug"
  | "colorLight"
  | "ceilingLight"
  | "light"
  | "curtain"
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
  | "humidity";

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

export function getCategory(deviceType: string | undefined): DeviceCategory {
  if (!deviceType) return "unknown";
  const t = deviceType.toLowerCase();
  // Check vacuum before bot ("Robot Vacuum Cleaner" partially matches "bot")
  if (
    t.includes("vacuum") ||
    t.includes("k10") ||
    t.includes("k20") ||
    t.includes("s10") ||
    t.includes("k11")
  )
    return "vacuum";
  if (t.includes("meter") || t.includes("thermo")) return "meter";
  if (t.includes("motion")) return "motion";
  if (t.includes("contact")) return "contact";
  if (t.includes("keypad")) return "keypad";
  if (t.includes("water")) return "water";
  if (t.includes("cam")) return "camera";
  if (t.includes("remote")) return "remote";
  if (t.includes("hub")) return "hub";
  if (t.includes("bot")) return "bot";
  if (t.includes("plug")) return "plug";
  if (t.includes("color bulb") || t.includes("strip")) return "colorLight";
  if (t.includes("ceiling light")) return "ceilingLight";
  if (t.includes("bulb") || t.includes("light") || t.includes("lamp"))
    return "light";
  if (t.includes("curtain") || t.includes("blind") || t.includes("roller"))
    return "curtain";
  if (t.includes("lock")) return "lock";
  if (t.includes("humidifier")) return "humidifier";
  if (t.includes("purifier")) return "purifier";
  if (t.includes("fan") || t.includes("circulator")) return "fan";
  if (t.includes("air conditioner")) return "airConditioner";
  if (t.includes("tv") || t.includes("dvd") || t.includes("projector"))
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

/** Return deviceType for physical devices, remoteType for infrared devices. */
export function getTypeLabel(device: Device | InfraredDevice): string {
  return "remoteType" in device ? device.remoteType : device.deviceType;
}
