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
    items.push({ label: t("status.current"), value: `${status.electricCurrent}A` });
  if (typeof status.electricityOfDay === "number")
    items.push({ label: t("status.powerToday"), value: `${status.electricityOfDay}W` });
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
