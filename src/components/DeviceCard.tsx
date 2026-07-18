import { useEffect, useState } from "react";
import { getDeviceStatus } from "../api";
import { getControls, getDeviceIcon, getTypeLabel } from "../deviceRegistry";
import { useSendCommand } from "../hooks";
import { formatStatusSummary } from "../status";
import type { Device, InfraredDevice, DeviceStatus, ToastFn } from "../types";

interface Props {
  device: Device | InfraredDevice;
  isInfrared: boolean;
  externalStatus?: DeviceStatus | null;
  /** 値が変わるたびにステータスを再取得する (ヘッダーの更新ボタン連動) */
  refreshSignal: number;
  onClick: () => void;
  onToast: ToastFn;
}

export function DeviceCard({
  device,
  isInfrared,
  externalStatus,
  refreshSignal,
  onClick,
  onToast,
}: Props) {
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const { send } = useSendCommand(device.deviceId, onToast);

  useEffect(() => {
    if (isInfrared) return;
    getDeviceStatus(device.deviceId)
      .then((res) => {
        if (res.statusCode === 100) setStatus(res.body);
      })
      .catch(() => {});
  }, [device.deviceId, isInfrared, refreshSignal]);

  useEffect(() => {
    if (externalStatus) setStatus(externalStatus);
  }, [externalStatus]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const command = status?.power === "on" ? "turnOff" : "turnOn";
    const newPower = command === "turnOn" ? "on" : "off";
    if (await send(command)) {
      setStatus((prev) => (prev ? { ...prev, power: newPower } : prev));
      onToast(`${device.deviceName}: ${newPower.toUpperCase()}`, "success");
    }
  };

  const typeLabel = getTypeLabel(device);
  const canToggle = !isInfrared && getControls(typeLabel).includes("power");
  const statusText = isInfrared ? typeLabel : formatStatusSummary(status);
  const battery = status?.battery;
  const lowBattery = typeof battery === "number" && battery <= 20;

  return (
    <div className="device-card" onClick={onClick}>
      <div className="device-card-icon">{getDeviceIcon(typeLabel)}</div>
      <div className="device-card-name">{device.deviceName}</div>
      {lowBattery && <span className="battery-badge">🪫 {battery}%</span>}
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
