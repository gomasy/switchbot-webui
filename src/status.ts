import { t } from "./i18n";
import type { DeviceStatus } from "./types";

/**
 * State fields SwitchBot reports with inconsistent casing: the status API
 * answers "ON"/"LOCKED" for some device types while webhooks answer "on".
 * Everything downstream compares against the lowercase form.
 */
const LOWERCASED_FIELDS = ["power", "lockState", "doorState", "openState"] as const;

/** Fold the casing of state fields as a status enters the app. Mutates in place. */
export function normalizeStatusCase<T extends Partial<DeviceStatus>>(status: T): T {
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
  // rather than an on/off state. Move it to `weight` and drop it, so `power`
  // holds a state everywhere downstream. Deleting rather than clearing matters:
  // these statuses get spread over one another, and an explicit `undefined`
  // would erase a good value from an earlier update.
  const raw = status as { power?: unknown; weight?: number };
  if (typeof raw.power === "number") {
    if (typeof raw.weight !== "number") raw.weight = raw.power;
    delete raw.power;
  }
  if (typeof status.switchStatus === "number") {
    status.power = status.switchStatus === 1 ? "on" : "off";
  }
  if (
    typeof status.status === "number" &&
    status.deviceType?.toLowerCase().includes("water")
  ) {
    status.waterDetected = status.status === 1;
  }
  return status;
}

/** Lock states other than locked/unlocked (notably "jammed") need attention. */
function lockLabel(lockState: string, locked: string, unlocked: string, other: string) {
  if (lockState === "locked") return locked;
  if (lockState === "unlocked") return unlocked;
  return other;
}

export function formatStatusSummary(status: DeviceStatus | null): string {
  if (!status) return "";
  const parts: string[] = [];
  if (status.power) parts.push(status.power === "on" ? "ON" : "OFF");
  if (typeof status.temperature === "number")
    parts.push(`${status.temperature}°C`);
  if (typeof status.humidity === "number") parts.push(`${status.humidity}%`);
  if (typeof status.battery === "number") parts.push(`🔋${status.battery}%`);
  if (status.lockState)
    parts.push(lockLabel(status.lockState, "🔒", "🔓", "⚠️"));
  if (status.waterDetected) parts.push(`🚨 ${t("status.waterLeak")}`);
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
  if (typeof status.temperature === "number")
    items.push({ label: t("status.temperature"), value: `${status.temperature}°C` });
  if (typeof status.humidity === "number")
    items.push({ label: t("status.humidity"), value: `${status.humidity}%` });
  if (typeof status.battery === "number")
    items.push({ label: t("status.battery"), value: `${status.battery}%` });
  if (status.version)
    items.push({ label: t("status.firmware"), value: status.version });
  if (typeof status.voltage === "number")
    items.push({ label: t("status.voltage"), value: `${status.voltage}V` });
  if (typeof status.electricCurrent === "number")
    // Reported in milliamperes; trailing zeros are dropped by Number().
    items.push({
      label: t("status.current"),
      value: `${Number((status.electricCurrent / 1000).toFixed(3))}A`,
    });
  if (typeof status.weight === "number")
    items.push({ label: t("status.power"), value: `${status.weight}W` });
  if (typeof status.electricityOfDay === "number")
    items.push({
      label: t("status.usageToday"),
      value: `${status.electricityOfDay} min`,
    });
  if (status.lockState)
    items.push({
      label: t("status.lock"),
      value: lockLabel(
        status.lockState,
        t("status.locked"),
        t("status.unlocked"),
        t("status.unknown"),
      ),
    });
  if (status.doorState)
    items.push({
      label: t("status.door"),
      value: status.doorState === "closed" ? t("status.closed") : t("status.open"),
    });
  if (status.moveDetected !== undefined)
    items.push({
      label: t("status.motionDetection"),
      value: status.moveDetected ? t("status.detected") : t("status.none"),
    });
  if (status.waterDetected !== undefined)
    items.push({
      label: t("status.waterLeak"),
      value: status.waterDetected ? t("status.detected") : t("status.none"),
    });
  if (typeof status.switch1Status === "number")
    items.push({
      label: `${t("control.channel")} 1`,
      value: status.switch1Status === 1 ? "ON" : "OFF",
    });
  if (typeof status.switch2Status === "number")
    items.push({
      label: `${t("control.channel")} 2`,
      value: status.switch2Status === 1 ? "ON" : "OFF",
    });
  if (status.openState)
    items.push({
      label: t("status.openClose"),
      value: status.openState === "close" ? t("status.closed") : t("status.open"),
    });
  if (status.workingStatus)
    items.push({ label: t("status.workingStatus"), value: status.workingStatus });
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
