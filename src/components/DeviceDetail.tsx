import { useCallback, useEffect, useRef, useState } from "react";
import { getControls, getDeviceIcon, getTypeLabel } from "../deviceRegistry";
import { useLiveStatus, useModalClose, useSendCommand } from "../hooks";
import { t } from "../i18n";
import { buildStatusItems } from "../status";
import type { Device, InfraredDevice, DeviceStatus, ToastFn } from "../types";
import type { SendFn } from "./controls";
import { IrControls } from "./IrControls";
import { PhysicalControls } from "./PhysicalControls";

interface Props {
  device: Device | InfraredDevice;
  isInfrared: boolean;
  externalStatus?: DeviceStatus | null;
  realtime: boolean;
  onClose: () => void;
  onToast: ToastFn;
}

export function DeviceDetail({
  device,
  isInfrared,
  externalStatus,
  realtime,
  onClose,
  onToast,
}: Props) {
  const [loading, setLoading] = useState(!isInfrared);
  const { status, version, refresh } = useLiveStatus(device, externalStatus);
  const { sending, send: sendRaw } = useSendCommand(device.deviceId, onToast);
  const refetchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mounted = useRef(true);

  const dialogRef = useModalClose(onClose);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(refetchTimer.current);
    };
  }, []);

  const fetchStatus = useCallback(async () => {
    if (isInfrared) return;
    setLoading(true);
    const result = await refresh();
    // A newer refresh (or an unmount) owns the outcome from here on.
    if (result === "superseded") return;
    // Unauthorized is handled globally; avoid a misleading failure toast.
    if (result === "failed") onToast(t("device.fetchStatusFailed"), "error");
    setLoading(false);
  }, [isInfrared, onToast, refresh]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // A realtime webhook already carries the change — including a color <-> color
  // temperature switch the eventually-consistent refetch would lag — so drop the
  // pending fallback refetch and save its daily-quota cost. Folding the update
  // into the status itself is useLiveStatus's job.
  useEffect(() => {
    if (externalStatus) clearTimeout(refetchTimer.current);
  }, [externalStatus]);

  const send: SendFn = async (command, parameter, commandType) => {
    const versionBeforeSend = version();
    const succeeded = await sendRaw(command, parameter, commandType);
    if (!succeeded || !mounted.current) return succeeded;

    onToast(`${device.deviceName}: ${command}`, "success");
    if (!isInfrared) {
      clearTimeout(refetchTimer.current);
      if (realtime && version() !== versionBeforeSend) return true;
      // With realtime on the webhook drives the update and this is only a
      // fallback, so the delay gives the webhook time to land and cancel it.
      // Without realtime it is the only update path, so fire it promptly.
      refetchTimer.current = setTimeout(fetchStatus, realtime ? 5000 : 1000);
    }
    return true;
  };

  const typeLabel = getTypeLabel(device);
  const controls = isInfrared ? [] : getControls(typeLabel);
  const statusItems = buildStatusItems(status);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-device-name"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <button
            className="modal-close"
            onClick={onClose}
            aria-label={t("device.close")}
          >
            ✕
          </button>
          <div className="modal-device-icon">{getDeviceIcon(typeLabel)}</div>
          <div className="modal-device-info">
            <div className="modal-device-name" id="modal-device-name">
              {device.deviceName}
            </div>
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
                deviceType={typeLabel}
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
