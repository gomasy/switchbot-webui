import { useCallback, useEffect, useRef, useState } from "react";
import { getDeviceStatus, UnauthorizedError } from "../api";
import { getControls, getDeviceIcon, getTypeLabel } from "../deviceRegistry";
import { useModalClose, useSendCommand } from "../hooks";
import { t } from "../i18n";
import { buildStatusItems } from "../status";
import type { Device, InfraredDevice, DeviceStatus, ToastFn } from "../types";
import type { SendFn } from "./controls";
import { IrControls } from "./IrControls";
import { PhysicalControls } from "./PhysicalControls";

interface Props {
  device: Device | InfraredDevice;
  isInfrared: boolean;
  onClose: (updatedStatus?: DeviceStatus | null) => void;
  onToast: ToastFn;
}

export function DeviceDetail({ device, isInfrared, onClose, onToast }: Props) {
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [loading, setLoading] = useState(!isInfrared);
  const { sending, send: sendRaw } = useSendCommand(device.deviceId, onToast);
  const refetchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useModalClose(() => onClose(status));
  useEffect(() => () => clearTimeout(refetchTimer.current), []);

  const fetchStatus = useCallback(async () => {
    if (isInfrared) return;
    try {
      setLoading(true);
      const res = await getDeviceStatus(device.deviceId);
      if (res.statusCode === 100) setStatus(res.body);
    } catch (e) {
      // Unauthorized is handled globally; avoid a misleading failure toast.
      if (!(e instanceof UnauthorizedError)) {
        onToast(t("device.fetchStatusFailed"), "error");
      }
    } finally {
      setLoading(false);
    }
  }, [device.deviceId, isInfrared, onToast]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const send: SendFn = async (command, parameter, commandType) => {
    if (await sendRaw(command, parameter, commandType)) {
      onToast(`${device.deviceName}: ${command}`, "success");
      if (!isInfrared) refetchTimer.current = setTimeout(fetchStatus, 1000);
    }
  };

  const typeLabel = getTypeLabel(device);
  const controls = isInfrared ? [] : getControls(typeLabel);
  const statusItems = buildStatusItems(status);

  return (
    <div className="modal-overlay" onClick={() => onClose(status)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button className="modal-close" onClick={() => onClose(status)}>
            ✕
          </button>
          <div className="modal-device-icon">{getDeviceIcon(typeLabel)}</div>
          <div className="modal-device-info">
            <div className="modal-device-name">{device.deviceName}</div>
            <div className="modal-device-type">{typeLabel}</div>
          </div>
        </div>

        <div className="modal-body">
          {loading && (
            <div className="loading">
              <div className="spinner" />
            </div>
          )}
          <div hidden={loading}>
            {statusItems.length > 0 && (
              <div className="status-section">
                <div className="status-grid">
                  {statusItems.map((item) => (
                    <div key={item.label} className="status-item">
                      <div className="status-value">{item.value}</div>
                      <div className="status-label">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isInfrared ? (
              <IrControls
                device={device as InfraredDevice}
                send={send}
                sending={sending}
              />
            ) : (
              <PhysicalControls
                controls={controls}
                status={status}
                send={send}
                sending={sending}
              />
            )}

            {!isInfrared && controls.length === 0 && statusItems.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <div className="empty-state-text">
                  {t("device.noDetails")}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
