import { useEffect } from "react";
import { getDeviceStatus } from "../api";
import { getDeviceIcon, getTypeLabel, hasPowerCommand } from "../deviceRegistry";
import { useLiveStatus, useSendCommand } from "../hooks";
import { tFmt } from "../i18n";
import { formatStatusSummary, isAnyPowerOn } from "../status";
import type { Device, DeviceStatus, InfraredDevice, ToastFn } from "../types";

interface Props {
  device: Device | InfraredDevice;
  isInfrared: boolean;
  externalStatus?: DeviceStatus | null;
  /** Triggers a status re-fetch whenever its value changes (linked to the header refresh button). */
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
  const { status, version, applyLocal, applyFetched } = useLiveStatus(
    device,
    externalStatus,
  );
  const { send } = useSendCommand(device.deviceId, onToast);

  useEffect(() => {
    if (isInfrared) return;
    let cancelled = false;
    const since = version();
    getDeviceStatus(device.deviceId)
      .then((res) => {
        if (cancelled || res.statusCode !== 100) return;
        applyFetched(res.body, since);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [device.deviceId, isInfrared, refreshSignal, version, applyFetched]);

  const isOn = status?.power === "on";

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // "partial" (one channel of a dual light) counts as on, so the toggle
    // finishes turning the device off rather than turning the rest of it on.
    const command = isAnyPowerOn(status) ? "turnOff" : "turnOn";
    const newPower = command === "turnOn" ? "on" : "off";
    if (await send(command)) {
      applyLocal({ power: newPower });
      onToast(`${device.deviceName}: ${newPower.toUpperCase()}`, "success");
    }
  };

  const typeLabel = getTypeLabel(device);
  const canToggle = !isInfrared && hasPowerCommand(typeLabel);
  const statusText = isInfrared ? typeLabel : formatStatusSummary(status);
  const battery = status?.battery;
  const lowBattery = typeof battery === "number" && battery <= 20;

  return (
    <div
      className="device-card"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        // Only the card itself: a key press on the nested toggle must flip the
        // switch, not also open the detail modal behind it.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="device-card-icon">{getDeviceIcon(typeLabel)}</div>
      <div className="device-card-name">{device.deviceName}</div>
      {lowBattery && <span className="battery-badge">🪫 {battery}%</span>}
      <div className="device-card-status">{statusText}</div>
      {canToggle && (
        // A button, not a <label> wrapping a checkbox: clicking such a label
        // fires the handler twice (once directly, once via the click it
        // forwards to the input), which sent every command to the API twice.
        <button
          type="button"
          className="toggle device-card-toggle"
          role="switch"
          aria-checked={isOn}
          aria-label={tFmt("device.togglePower", { name: device.deviceName })}
          onClick={handleToggle}
        >
          <span className="toggle-slider" />
        </button>
      )}
    </div>
  );
}
