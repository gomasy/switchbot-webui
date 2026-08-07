import { getCategory } from "./deviceRegistry";
import { t } from "./i18n";
import type { DeviceStatus } from "./types";

/**
 * State fields SwitchBot reports with inconsistent casing: the status API
 * answers "ON"/"LOCKED" for some device types while webhooks answer "on".
 * Everything downstream compares against the lowercase form.
 */
const LOWERCASED_FIELDS = [
  "power",
  "lockState",
  "doorState",
  "openState",
  "onlineStatus",
  "chargingStatus",
  "nightStatus",
  "oscillation",
  "verticalOscillation",
  "mainLightPower",
  "colorLightPower",
] as const;

/** Fold the casing of state fields as a status enters the app. Mutates in place. */
function normalizeStatusCase<T extends Partial<DeviceStatus>>(status: T): T {
  for (const field of LOWERCASED_FIELDS) {
    const value = status[field];
    if (typeof value === "string") status[field] = value.toLowerCase();
  }
  return status;
}

/** Normalize device-specific API fields into the common fields rendered by the UI. */
export function normalizeDeviceStatus<T extends Partial<DeviceStatus>>(status: T): T {
  normalizeStatusCase(status);
  // Metering devices (plugs, relays) report instantaneous watts in `power`
  // rather than an on/off state; move it to `weight` so `power` holds a state
  // everywhere downstream. Deleting rather than clearing matters: these statuses
  // get spread over one another, and an explicit `undefined` would erase a good
  // value from an earlier update.
  const raw = status as { power?: unknown; weight?: number };
  if (typeof raw.power === "number") {
    if (typeof raw.weight !== "number") raw.weight = raw.power;
    delete raw.power;
  }
  if (typeof status.switchStatus === "number") {
    status.power = status.switchStatus === 1 ? "on" : "off";
  }
  // The Garage Door Opener reports its switch inverted: 0 is on, 1 is off.
  if (typeof status.doorStatus === "number") {
    status.power = status.doorStatus === 0 ? "on" : "off";
  }
  // Some newer devices report reachability as a boolean rather than a state.
  if (typeof status.online === "boolean") {
    status.onlineStatus = status.online ? "online" : "offline";
  }
  if (
    typeof status.status === "number" &&
    status.deviceType?.toLowerCase().includes("water")
  ) {
    status.waterDetected = status.status === 1;
  }
  return status;
}

const LOCKED_STATES = ["locked", "lock", "latchboltlocked"];
const UNLOCKED_STATES = ["unlocked", "unlock"];

/** Lock states other than locked/unlocked (notably "jammed") need attention. */
function lockLabel(lockState: string, locked: string, unlocked: string, other: string) {
  if (LOCKED_STATES.includes(lockState)) return locked;
  if (UNLOCKED_STATES.includes(lockState)) return unlocked;
  return other;
}

/** True when a boolean-ish flag from the API (boolean, 0/1, "on") is set. */
function isEnabled(value: boolean | number | string): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return value.toLowerCase() === "on" || value.toLowerCase() === "true";
}

/**
 * The child lock, reported as a boolean, a 0/1 integer or an "on"/"off" string
 * depending on the device family. Undefined when unreported, which the on/off
 * buttons render as "neither selected".
 */
export function childLockOf(status: DeviceStatus | null): boolean | undefined {
  const lock = status?.childLock;
  return lock === undefined ? undefined : isEnabled(lock);
}

/**
 * True when anything on the device is on. A dual-channel light reports
 * "partial" while only one of its two channels is lit, and turnOff is what
 * takes it from there to fully off.
 */
export function isAnyPowerOn(status: DeviceStatus | null | undefined): boolean {
  return status?.power === "on" || status?.power === "partial";
}

/**
 * `mode` is an integer whose meaning is device-specific (a plain string on the
 * circulator fans). Labels for the scales we know; anything else is shown as the
 * API reported it rather than as a meaningless number.
 */
const NUMERIC_MODES: Partial<Record<string, string[]>> = {
  purifier: ["purifier.normal", "purifier.auto", "purifier.sleep", "purifier.pet"],
  humidifier2: [
    "humid.level4",
    "humid.level3",
    "humid.level2",
    "humid.level1",
    "humid.target",
    "humid.sleep",
    "humid.auto",
    "humid.drying",
  ],
  thermostat: [
    "thermo.schedule",
    "thermo.manual",
    "thermo.off",
    "thermo.eco",
    "thermo.comfort",
    "thermo.boost",
  ],
};

/** A readable label for `mode`, or null when the device reports none. */
function modeLabel(status: DeviceStatus): string | null {
  const mode = status.mode;
  if (mode === undefined) return null;
  if (typeof mode === "string") {
    // Fan modes have labels; anything else (a companion robot's state, say) is
    // shown as reported rather than as an untranslated key.
    const key = `wind.${mode}`;
    const label = t(key);
    return label === key ? mode : label;
  }
  const category = getCategory(status.deviceType);
  const labels = NUMERIC_MODES[category];
  if (!labels) return `${mode}`;
  // Only the thermostat numbers its modes from zero.
  const index = category === "thermostat" ? mode : mode - 1;
  return labels[index] ? t(labels[index]) : `${mode}`;
}

export function formatStatusSummary(status: DeviceStatus | null): string {
  if (!status) return "";
  const parts: string[] = [];
  if (status.power) parts.push(status.power === "on" ? "ON" : "OFF");
  if (typeof status.temperature === "number")
    parts.push(`${status.temperature}°C`);
  if (typeof status.humidity === "number") parts.push(`${status.humidity}%`);
  if (typeof status.CO2 === "number") parts.push(`${status.CO2}ppm`);
  if (typeof status.battery === "number") parts.push(`🔋${status.battery}%`);
  if (status.lockState)
    parts.push(lockLabel(status.lockState, "🔒", "🔓", "⚠️"));
  if (status.waterDetected) parts.push(`🚨 ${t("status.waterLeak")}`);
  if (status.Detected) parts.push(`🚶 ${t("status.detected")}`);
  if (typeof status.switch1Status === "number")
    parts.push(`1:${status.switch1Status === 1 ? "ON" : "OFF"}`);
  if (typeof status.switch2Status === "number")
    parts.push(`2:${status.switch2Status === 1 ? "ON" : "OFF"}`);
  if (
    typeof status.brightness === "number" &&
    typeof status.temperature !== "number"
  )
    parts.push(`💡${status.brightness}%`);
  return parts.join("  ");
}

export interface StatusItem {
  label: string;
  value: string;
}

export function buildStatusItems(status: DeviceStatus | null): StatusItem[] {
  if (!status) return [];
  const items: StatusItem[] = [];
  const add = (label: string, value: string) => items.push({ label, value });
  const onOff = (value: boolean | number | string) =>
    isEnabled(value) ? t("common.on") : t("common.off");
  const detection = (detected: boolean) =>
    detected ? t("status.detected") : t("status.none");
  // Open/closed states are spelled "close" by some devices and "closed" by others.
  const openClosed = (state: string) =>
    state.startsWith("close") ? t("status.closed") : t("status.open");

  // Ambience
  if (typeof status.temperature === "number")
    add(t("status.temperature"), `${status.temperature}°C`);
  if (typeof status.humidity === "number")
    add(t("status.humidity"), `${status.humidity}%`);
  if (typeof status.CO2 === "number") add(t("status.co2"), `${status.CO2}ppm`);
  if (typeof status.lightLevel === "number")
    add(t("status.lightLevel"), `${status.lightLevel}`);
  // Motion and contact sensors grade the ambient light instead of measuring it.
  if (typeof status.brightness === "string")
    add(t("status.ambientLight"), t(`status.${status.brightness}`));

  // Power source
  if (typeof status.battery === "number")
    add(t("status.battery"), `${status.battery}%`);
  if (typeof status.waterBaseBattery === "number")
    add(t("status.waterBase"), `${status.waterBaseBattery}%`);
  if (status.chargingStatus)
    add(t("status.charge"), t(`status.${status.chargingStatus}`));
  if (status.version) add(t("status.firmware"), status.version);

  // Metering
  if (typeof status.voltage === "number")
    add(t("status.voltage"), `${status.voltage}V`);
  if (typeof status.electricCurrent === "number")
    // Reported in milliamperes; trailing zeros are dropped by Number().
    add(
      t("status.current"),
      `${Number((status.electricCurrent / 1000).toFixed(3))}A`,
    );
  if (typeof status.weight === "number")
    add(t("status.power"), `${status.weight}W`);
  if (typeof status.electricityOfDay === "number")
    add(t("status.usageToday"), `${status.electricityOfDay} min`);
  if (typeof status.usedElectricity === "number")
    // Reported in watt-minutes, which is not a unit anyone reads meters in.
    add(
      t("status.energyToday"),
      `${Number((status.usedElectricity / 60).toFixed(1))}Wh`,
    );

  // Openings
  if (status.lockState)
    add(
      t("status.lock"),
      lockLabel(
        status.lockState,
        t("status.locked"),
        t("status.unlocked"),
        t("status.unknown"),
      ),
    );
  if (status.doorState) add(t("status.door"), openClosed(status.doorState));
  if (status.openState) add(t("status.openClose"), openClosed(status.openState));
  if (typeof status.position === "number")
    add(t("control.position"), `${status.position}%`);

  // Detection
  if (status.moveDetected !== undefined)
    add(t("status.motionDetection"), detection(status.moveDetected));
  if (status.Detected !== undefined)
    add(t("status.presence"), detection(status.Detected));
  if (status.waterDetected !== undefined)
    add(t("status.waterLeak"), detection(status.waterDetected));

  // Switch channels
  for (const channel of [1, 2] as const) {
    const label = `${t("control.channel")} ${channel}`;
    const state = status[`switch${channel}Status`];
    if (typeof state === "number") add(label, state === 1 ? "ON" : "OFF");
    const watts = status[`switch${channel}Power`];
    if (typeof watts === "number") add(`${label} ${t("status.power")}`, `${watts}W`);
  }

  // Appliance settings
  const mode = modeLabel(status);
  if (mode) add(t("control.mode"), mode);
  if (typeof status.fanSpeed === "number")
    add(t("control.fanSpeed"), `${status.fanSpeed}`);
  if (status.nightStatus)
    add(
      t("control.nightLight"),
      status.nightStatus === "off" ? t("common.off") : status.nightStatus,
    );
  if (status.oscillation)
    add(t("status.oscillation"), onOff(status.oscillation));
  if (status.verticalOscillation)
    add(t("status.verticalOscillation"), onOff(status.verticalOscillation));
  if (status.childLock !== undefined)
    add(t("control.childLock"), onOff(status.childLock));
  if (status.drying) add(t("status.drying"), t("common.on"));
  if (status.filterElement?.usedHours !== undefined)
    add(
      t("status.filter"),
      `${status.filterElement.usedHours}/${status.filterElement.effectiveUsageHours ?? "?"}h`,
    );

  // Dual-channel lights
  if (status.mainLightPower)
    add(t("control.mainLight"), onOff(status.mainLightPower));
  if (status.colorLightPower)
    add(t("control.colorLight"), onOff(status.colorLightPower));

  // Activity
  if (status.workingStatus) add(t("status.workingStatus"), status.workingStatus);
  if (status.taskType) add(t("status.task"), status.taskType);
  if (status.moving) add(t("status.moving"), t("common.on"));
  // Only worth showing when something is wrong.
  if (status.calibrate === false) add(t("status.calibration"), t("status.notCalibrated"));
  if (status.isStuck && isEnabled(status.isStuck))
    add(t("status.stuck"), t("common.on"));
  if (status.onlineStatus === "offline")
    add(t("status.connection"), t("status.offline"));

  return items;
}

export function deviceColorToHex(color: string): string {
  const [r, g, b] = color.split(":").map(Number);
  // Clamp to a valid byte (and coerce NaN to 0) so the result is always a
  // well-formed hex color; an invalid value silently resets <input type="color">.
  const hex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n) || 0))
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function hexToDeviceColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}:${g}:${b}`;
}
