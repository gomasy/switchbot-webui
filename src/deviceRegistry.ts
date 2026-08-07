import type { Device, InfraredDevice } from "./types";

export type DeviceCategory =
  | "bot"
  | "plug"
  | "colorLight"
  | "rgbLight"
  | "ceilingLight"
  | "dualLight"
  | "light"
  | "curtain"
  | "roller"
  | "blindTilt"
  | "relay"
  | "relay2"
  | "lock"
  | "meter"
  | "motion"
  | "presence"
  | "contact"
  | "keypad"
  | "water"
  | "camera"
  | "doorbell"
  | "remote"
  | "hub"
  | "humidifier"
  | "humidifier2"
  | "vacuum"
  | "purifier"
  | "fan"
  | "circulatorFan"
  | "thermostat"
  | "garage"
  | "artFrame"
  | "weatherStation"
  | "companion"
  | "sensorOnly"
  | "airConditioner"
  | "tv"
  | "speaker"
  | "waterHeater"
  | "unknown";

export type ControlKind =
  | "power"
  | "press"
  | "brightness"
  | "color"
  | "colorTemp"
  | "position"
  | "blindTilt"
  | "lock"
  | "vacuum"
  | "humidity"
  | "humidifier2"
  | "relayChannels"
  | "purifier"
  | "wind"
  | "thermostat"
  | "dualLight"
  | "motionDetection"
  | "artFrame"
  | "weatherText"
  | "companion";

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
  // RGB-only strips and rope lights take setColor but no color temperature.
  rgbLight: { icon: "💡", controls: ["power", "brightness", "color"] },
  ceilingLight: { icon: "💡", controls: ["power", "brightness", "colorTemp"] },
  dualLight: { icon: "💡", controls: ["dualLight"] },
  light: { icon: "💡", controls: ["power", "brightness"] },
  curtain: { icon: "🪟", controls: ["position"] },
  roller: { icon: "🪟", controls: ["position"] },
  blindTilt: { icon: "🪟", controls: ["blindTilt"] },
  relay: { icon: "🔌", controls: ["power"] },
  // A 2PM wired to a roller blind reports a position and takes setPosition too.
  relay2: { icon: "🔌", controls: ["relayChannels", "position"] },
  lock: { icon: "🔒", controls: ["lock"] },
  meter: { icon: "🌡️", controls: [] },
  motion: { icon: "👁️", controls: [] },
  presence: { icon: "🚶", controls: [] },
  contact: { icon: "🚪", controls: [] },
  keypad: { icon: "🔢", controls: [] },
  water: { icon: "💧", controls: [] },
  camera: { icon: "📷", controls: [] },
  doorbell: { icon: "🔔", controls: ["motionDetection"] },
  remote: { icon: "📱", controls: [] },
  hub: { icon: "📡", controls: [] },
  humidifier: { icon: "💧", controls: ["power", "humidity"] },
  humidifier2: { icon: "💧", controls: ["power", "humidifier2"] },
  vacuum: { icon: "🧹", controls: ["vacuum"] },
  purifier: { icon: "🌬️", controls: ["power", "purifier"] },
  fan: { icon: "🌀", controls: ["power"] },
  circulatorFan: { icon: "🌀", controls: ["power", "wind"] },
  thermostat: { icon: "🔥", controls: ["power", "thermostat"] },
  garage: { icon: "🚗", controls: ["power"] },
  artFrame: { icon: "🖼️", controls: ["artFrame"] },
  weatherStation: { icon: "🌤️", controls: ["weatherText"] },
  companion: { icon: "🐾", controls: ["companion"] },
  // Devices the API reports status for but accepts no commands from.
  sensorOnly: { icon: "📊", controls: [] },
  // Infrared remote types: their commands come from IrControls, not from here.
  airConditioner: { icon: "❄️", controls: [] },
  tv: { icon: "📺", controls: [] },
  speaker: { icon: "🔊", controls: [] },
  waterHeater: { icon: "🚿", controls: [] },
  // Unknown types likely have controllable power
  unknown: { icon: "📱", controls: ["power"] },
};

/** Robot vacuum models whose deviceType does not contain "vacuum". */
const VACUUM_MODELS = ["k10", "k11", "k20", "s10", "s20"];

/**
 * Vacuum models that speak the newer startClean/pause command set instead of
 * start/stop. Kept next to VACUUM_MODELS so the two cannot drift: a model
 * missing from that list is never categorized as a vacuum in the first place.
 * "combo" covers the K10+ Pro Combo, which shares the K10+ name but not its
 * command set.
 */
const ADVANCED_VACUUM_MODELS = ["s10", "s20", "k20", "k11", "combo"];

/** Vacuums with a water base: only these accept a mop moisture level. */
const MOPPING_VACUUM_MODELS = ["s10", "s20"];

function matchesModel(deviceType: string, models: string[]): boolean {
  const dt = deviceType.toLowerCase();
  return models.some((model) => dt.includes(model));
}

/**
 * deviceType substrings mapped to a category, in priority order. Order is the
 * whole specification here: several product names contain another product's
 * name ("Smart Radiator Thermostat" contains "thermo", "Blind Tilt" contains
 * "blind"), so the more specific pattern has to be tested first.
 */
const CATEGORY_PATTERNS: [string[], DeviceCategory][] = [
  [["thermostat"], "thermostat"],
  // The Outdoor Meter reports itself as WoIOSensor, with no "meter" in sight.
  [["meter", "thermo", "woiosensor"], "meter"],
  [["presence sensor"], "presence"],
  [["motion"], "motion"],
  [["contact"], "contact"],
  [["keypad"], "keypad"],
  [["doorbell"], "doorbell"],
  [["water detector", "water leak"], "water"],
  [["cam"], "camera"],
  [["remote"], "remote"],
  [["hub"], "hub"],
  [["bot"], "bot"],
  [["garage door"], "garage"],
  [["plug"], "plug"],
  [["relay switch 2pm"], "relay2"],
  [["relay switch"], "relay"],
  [["rgbicww ceiling light"], "dualLight"],
  [["ceiling light"], "ceilingLight"],
  // RGBIC without the trailing WW has no white channel, so no color temperature.
  [["rgbicww"], "colorLight"],
  [["neon"], "rgbLight"],
  [["strip light 3"], "colorLight"],
  [["strip"], "rgbLight"],
  [["color bulb", "floor lamp", "outdoor lights"], "colorLight"],
  [["bulb", "light", "lamp"], "light"],
  [["roller shade"], "roller"],
  [["blind tilt"], "blindTilt"],
  [["curtain", "blind"], "curtain"],
  [["lock"], "lock"],
  [["climate panel", "mindclip"], "sensorOnly"],
  // The evaporative models report deviceType "Humidifier2" and take a very
  // different setMode payload than the original Humidifier.
  [["humidifier2"], "humidifier2"],
  [["humidifier"], "humidifier"],
  [["purifier"], "purifier"],
  [["circulator"], "circulatorFan"],
  [["fan"], "fan"],
  [["art frame"], "artFrame"],
  [["weather station", "weatherstation"], "weatherStation"],
  [["kata"], "companion"],
  [["air conditioner"], "airConditioner"],
  [["speaker"], "speaker"],
  [["water heater"], "waterHeater"],
  [["tv", "iptv", "streamer", "set top box", "dvd", "projector"], "tv"],
];

export function getCategory(deviceType: string | undefined): DeviceCategory {
  if (!deviceType) return "unknown";
  const dt = deviceType.toLowerCase();
  // Check vacuum before bot ("Robot Vacuum Cleaner" partially matches "bot")
  if (dt.includes("vacuum") || matchesModel(dt, VACUUM_MODELS)) return "vacuum";
  for (const [patterns, category] of CATEGORY_PATTERNS) {
    if (patterns.some((p) => dt.includes(p))) return category;
  }
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

/**
 * Whether turnOn/turnOff drive this device, which is what a card's toggle
 * sends. A dual-channel light has no plain power control of its own, but the
 * pair still switches both of its channels at once.
 */
export function hasPowerCommand(deviceType: string): boolean {
  return getControls(deviceType).some((c) => c === "power" || c === "dualLight");
}

export interface VacuumProfile {
  /** Command that starts a clean, and whether it carries a parameter. */
  start: string;
  stop: string;
  /** True for the startClean generation, which also accepts setVolume. */
  advanced: boolean;
  /** Cleaning modes accepted by startClean; empty for the start/stop models. */
  modes: string[];
  /** Only models with a water base accept a mop moisture level. */
  mopping: boolean;
  /** Only the water-base models can wash and dry their own mop. */
  selfClean: boolean;
}

/** The command set this vacuum model understands. */
export function getVacuumProfile(deviceType: string): VacuumProfile {
  if (!matchesModel(deviceType, ADVANCED_VACUUM_MODELS)) {
    // The older models take no parameters; suction is set separately.
    return {
      start: "start",
      stop: "stop",
      advanced: false,
      modes: [],
      mopping: false,
      selfClean: false,
    };
  }
  const mopping = matchesModel(deviceType, MOPPING_VACUUM_MODELS);
  return {
    start: "startClean",
    stop: "pause",
    advanced: true,
    // The water-base models mop in the same pass; the others swap in a mop.
    modes: mopping ? ["sweep", "sweep_mop"] : ["sweep", "mop"],
    mopping,
    selfClean: mopping,
  };
}

/** Extra lock commands beyond lock/unlock that this model accepts. */
export function getLockCommands(deviceType: string): string[] {
  const dt = deviceType.toLowerCase();
  // Lock Lite has no deadbolt, and the Vision models expose passcodes instead.
  if (dt.includes("lite") || dt.includes("vision")) return [];
  const commands = ["deadbolt"];
  // Only the Matter-enabled Pro documents the EU night latch.
  if (dt.includes("wifi")) commands.push("nightLatchUnlock");
  return commands;
}

export interface FanOption {
  value: string;
  /** i18n key for the label. */
  key: string;
}

export interface FanProfile {
  modes: FanOption[];
  nightLight: FanOption[];
}

/** Wind modes and nightlight levels differ between circulator fan generations. */
export function getFanProfile(deviceType: string): FanProfile {
  const modes = [
    { value: "direct", key: "wind.direct" },
    { value: "natural", key: "wind.natural" },
    { value: "sleep", key: "wind.sleep" },
  ];
  // The 2 Pro replaced the ultra-quiet mode with a hurricane mode, and
  // renumbered its nightlight levels.
  if (deviceType.toLowerCase().includes("2 pro")) {
    return {
      modes: [...modes, { value: "hurricane", key: "wind.hurricane" }],
      nightLight: [
        { value: "off", key: "common.off" },
        { value: "0", key: "wind.bright" },
        { value: "1", key: "wind.soft" },
      ],
    };
  }
  return {
    modes: [...modes, { value: "baby", key: "wind.baby" }],
    nightLight: [
      { value: "off", key: "common.off" },
      { value: "1", key: "wind.bright" },
      { value: "2", key: "wind.dim" },
    ],
  };
}

/**
 * The parameter shape `setPosition` expects. Curtains address a motor within a
 * group and pick a movement mode; everything else takes a bare percentage.
 */
export function formatPosition(
  category: DeviceCategory,
  position: number,
): string {
  return category === "curtain" ? `0,ff,${position}` : `${position}`;
}

/**
 * The control layout an infrared remote gets. Coarser than the icon categories
 * above: everything with transport controls and a volume rocker is one `player`,
 * and anything unrecognized still answers turnOn/turnOff.
 */
export type RemoteKind =
  | "airConditioner"
  | "tv"
  | "player"
  | "light"
  | "fan"
  | "others"
  | "unknown";

export interface RemoteProfile {
  kind: RemoteKind;
  /**
   * A DIY remote replays codes its owner recorded button by button, so it has
   * none of the extras its kind normally documents — only the recorded buttons.
   */
  diy: boolean;
}

/**
 * remoteType substrings mapped to a remote kind, in priority order. No SwitchBot
 * remote type matches two of these rows today; the order fixes what would happen
 * if one ever did.
 */
const REMOTE_PATTERNS: [string[], RemoteKind][] = [
  [["air conditioner"], "airConditioner"],
  [["tv", "iptv", "streamer", "set top box"], "tv"],
  [["dvd", "speaker", "projector"], "player"],
  [["fan"], "fan"],
  [["light"], "light"],
];

/** How to lay out the controls for an infrared remote. */
export function getRemoteProfile(remoteType: string): RemoteProfile {
  const rt = remoteType.toLowerCase();
  // "Others" is the API's own escape hatch: no command set at all, just a name
  // the user types. A DIY variant of it would mean nothing.
  if (rt === "others") return { kind: "others", diy: false };
  const diy = rt.startsWith("diy");
  for (const [patterns, kind] of REMOTE_PATTERNS) {
    if (patterns.some((p) => rt.includes(p))) return { kind, diy };
  }
  return { kind: "unknown", diy };
}

/** Return deviceType for physical devices, remoteType for infrared devices. */
export function getTypeLabel(device: Device | InfraredDevice): string {
  return "remoteType" in device ? device.remoteType : device.deviceType;
}
