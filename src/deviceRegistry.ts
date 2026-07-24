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
  const dt = deviceType.toLowerCase();
  // Check vacuum before bot ("Robot Vacuum Cleaner" partially matches "bot")
  if (
    dt.includes("vacuum") ||
    dt.includes("k10") ||
    dt.includes("k20") ||
    dt.includes("s10") ||
    dt.includes("k11")
  )
    return "vacuum";
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
  if (dt.includes("color bulb") || dt.includes("strip")) return "colorLight";
  if (dt.includes("ceiling light")) return "ceilingLight";
  if (dt.includes("bulb") || dt.includes("light") || dt.includes("lamp"))
    return "light";
  if (dt.includes("curtain") || dt.includes("blind") || dt.includes("roller"))
    return "curtain";
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

/** Return deviceType for physical devices, remoteType for infrared devices. */
export function getTypeLabel(device: Device | InfraredDevice): string {
  return "remoteType" in device ? device.remoteType : device.deviceType;
}
