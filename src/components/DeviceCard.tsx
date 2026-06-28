import { useEffect, useState } from "react";
import { getDeviceStatus, sendCommand } from "../api";
import { getDeviceIcon } from "../deviceIcon";
import type { Device, InfraredDevice, DeviceStatus } from "../types";

function isToggleable(deviceType: string): boolean {
  const t = deviceType.toLowerCase();
  return (
    t.includes("bot") ||
    t.includes("plug") ||
    t.includes("bulb") ||
    t.includes("light") ||
    t.includes("strip") ||
    t.includes("lamp") ||
    t.includes("humidifier") ||
    t.includes("ceiling")
  );
}

function formatStatus(status: DeviceStatus | null): string {
  if (!status) return "";
  const parts: string[] = [];
  if (status.power) parts.push(status.power === "on" ? "ON" : "OFF");
  if (typeof status.temperature === "number")
    parts.push(`${status.temperature}°C`);
  if (typeof status.humidity === "number") parts.push(`${status.humidity}%`);
  if (typeof status.battery === "number") parts.push(`🔋${status.battery}%`);
  if (status.lockState) parts.push(status.lockState === "locked" ? "🔒" : "🔓");
  if (typeof status.brightness === "number" && !parts.some((p) => p.includes("°")))
    parts.push(`💡${status.brightness}%`);
  return parts.join("  ");
}

interface Props {
  device: Device | InfraredDevice;
  isInfrared: boolean;
  onClick: () => void;
  onToast: (msg: string, type: "success" | "error") => void;
}

export function DeviceCard({ device, isInfrared, onClick, onToast }: Props) {
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (isInfrared) return;
    getDeviceStatus(device.deviceId)
      .then((res) => {
        if (res.statusCode === 100) setStatus(res.body);
      })
      .catch(() => {});
  }, [device.deviceId, isInfrared]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (toggling) return;
    setToggling(true);
    const newPower = status?.power === "on" ? "turnOff" : "turnOn";
    try {
      const res = await sendCommand(device.deviceId, newPower);
      if (res.statusCode === 100) {
        setStatus((prev) =>
          prev
            ? { ...prev, power: newPower === "turnOn" ? "on" : "off" }
            : prev,
        );
        onToast(
          `${device.deviceName}: ${newPower === "turnOn" ? "ON" : "OFF"}`,
          "success",
        );
      } else {
        onToast(`エラー: ${res.message}`, "error");
      }
    } catch {
      onToast("コマンドの送信に失敗しました", "error");
    } finally {
      setToggling(false);
    }
  };

  const typeLabel = isInfrared
    ? (device as InfraredDevice).remoteType
    : (device as Device).deviceType;
  const canToggle =
    !isInfrared && isToggleable((device as Device).deviceType);
  const statusText = isInfrared ? typeLabel : formatStatus(status);

  return (
    <div className="device-card" onClick={onClick}>
      <div className="device-card-icon">
        {getDeviceIcon(typeLabel)}
      </div>
      <div className="device-card-name">{device.deviceName}</div>
      <div className="device-card-status">{statusText}</div>
      {canToggle && (
        <label className="toggle device-card-toggle" onClick={handleToggle}>
          <input
            type="checkbox"
            checked={status?.power === "on"}
            readOnly
          />
          <span className="toggle-slider" />
        </label>
      )}
    </div>
  );
}
