import { useEffect, useState } from "react";
import { getDeviceStatus, sendCommand } from "../api";
import { getControls, getDeviceIcon, getTypeLabel } from "../deviceRegistry";
import { formatStatusSummary } from "../status";
import type { Device, InfraredDevice, DeviceStatus, ToastFn } from "../types";

interface Props {
  device: Device | InfraredDevice;
  isInfrared: boolean;
  externalStatus?: DeviceStatus | null;
  onClick: () => void;
  onToast: ToastFn;
}

export function DeviceCard({
  device,
  isInfrared,
  externalStatus,
  onClick,
  onToast,
}: Props) {
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

  useEffect(() => {
    if (externalStatus) setStatus(externalStatus);
  }, [externalStatus]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (toggling) return;
    setToggling(true);
    const command = status?.power === "on" ? "turnOff" : "turnOn";
    const newPower = command === "turnOn" ? "on" : "off";
    try {
      const res = await sendCommand(device.deviceId, command);
      if (res.statusCode === 100) {
        setStatus((prev) => (prev ? { ...prev, power: newPower } : prev));
        onToast(`${device.deviceName}: ${newPower.toUpperCase()}`, "success");
      } else {
        onToast(`エラー: ${res.message}`, "error");
      }
    } catch {
      onToast("コマンドの送信に失敗しました", "error");
    } finally {
      setToggling(false);
    }
  };

  const typeLabel = getTypeLabel(device);
  const canToggle = !isInfrared && getControls(typeLabel).includes("power");
  const statusText = isInfrared ? typeLabel : formatStatusSummary(status);

  return (
    <div className="device-card" onClick={onClick}>
      <div className="device-card-icon">{getDeviceIcon(typeLabel)}</div>
      <div className="device-card-name">{device.deviceName}</div>
      <div className="device-card-status">{statusText}</div>
      {canToggle && (
        <label className="toggle device-card-toggle" onClick={handleToggle}>
          <input type="checkbox" checked={status?.power === "on"} readOnly />
          <span className="toggle-slider" />
        </label>
      )}
    </div>
  );
}
