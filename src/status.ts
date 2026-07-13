import type { DeviceStatus } from "./types";

/** デバイスカードに表示する 1 行サマリ */
export function formatStatusSummary(status: DeviceStatus | null): string {
  if (!status) return "";
  const parts: string[] = [];
  if (status.power) parts.push(status.power === "on" ? "ON" : "OFF");
  if (typeof status.temperature === "number")
    parts.push(`${status.temperature}°C`);
  if (typeof status.humidity === "number") parts.push(`${status.humidity}%`);
  if (typeof status.battery === "number") parts.push(`🔋${status.battery}%`);
  if (status.lockState) parts.push(status.lockState === "locked" ? "🔒" : "🔓");
  if (
    typeof status.brightness === "number" &&
    !parts.some((p) => p.includes("°"))
  )
    parts.push(`💡${status.brightness}%`);
  return parts.join("  ");
}

export interface StatusItem {
  label: string;
  value: string;
}

/** 詳細モーダルのステータスグリッドに表示する項目一覧 */
export function buildStatusItems(status: DeviceStatus | null): StatusItem[] {
  if (!status) return [];
  const items: StatusItem[] = [];
  if (typeof status.temperature === "number")
    items.push({ label: "温度", value: `${status.temperature}°C` });
  if (typeof status.humidity === "number")
    items.push({ label: "湿度", value: `${status.humidity}%` });
  if (typeof status.battery === "number")
    items.push({ label: "バッテリー", value: `${status.battery}%` });
  if (status.version)
    items.push({ label: "ファームウェア", value: status.version });
  if (typeof status.voltage === "number")
    items.push({ label: "電圧", value: `${status.voltage}V` });
  if (typeof status.electricCurrent === "number")
    items.push({ label: "電流", value: `${status.electricCurrent}A` });
  if (typeof status.electricityOfDay === "number")
    items.push({ label: "本日の電力", value: `${status.electricityOfDay}W` });
  if (status.lockState)
    items.push({
      label: "ロック",
      value: status.lockState === "locked" ? "施錠" : "解錠",
    });
  if (status.doorState)
    items.push({
      label: "ドア",
      value: status.doorState === "closed" ? "閉" : "開",
    });
  if (status.moveDetected !== undefined)
    items.push({
      label: "動体検知",
      value: status.moveDetected ? "検知" : "なし",
    });
  if (status.openState)
    items.push({
      label: "開閉",
      value: status.openState === "close" ? "閉" : "開",
    });
  if (status.workingStatus)
    items.push({ label: "動作状態", value: status.workingStatus });
  return items;
}

/** SwitchBot API の "r:g:b" 形式を "#rrggbb" に変換 */
export function deviceColorToHex(color: string): string {
  const [r, g, b] = color.split(":").map(Number);
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** "#rrggbb" を SwitchBot API の "r:g:b" 形式に変換 */
export function hexToDeviceColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}:${g}:${b}`;
}
