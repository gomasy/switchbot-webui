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
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [loading, setLoading] = useState(!isInfrared);
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
    try {
      setLoading(true);
      const res = await getDeviceStatus(device.deviceId);
      if (mounted.current && res.statusCode === 100) setStatus(res.body);
    } catch (e) {
      // Unauthorized is handled globally; avoid a misleading failure toast.
      if (mounted.current && !(e instanceof UnauthorizedError)) {
        onToast(t("device.fetchStatusFailed"), "error");
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [device.deviceId, isInfrared, onToast]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Fold each realtime webhook into the fetched status (merge, not replace, so
  // earlier partial events survive) and cancel any pending fallback refetch:
  // the webhook already carries the change — including a color <-> color
  // temperature switch the eventually-consistent refetch would lag — so the
  // extra status request (and its daily-quota cost) is unnecessary.
  useEffect(() => {
    if (!externalStatus) return;
    clearTimeout(refetchTimer.current);
    setStatus((prev) => ({ ...prev, ...externalStatus }));
  }, [externalStatus]);

  const send: SendFn = async (command, parameter, commandType) => {
    const succeeded = await sendRaw(command, parameter, commandType);
    if (!succeeded || !mounted.current) return succeeded;

    onToast(`${device.deviceName}: ${command}`, "success");
    if (!isInfrared) {
      clearTimeout(refetchTimer.current);
      // With realtime on, let the webhook drive the update and keep the refetch
      // only as a fallback for when no notification arrives; the longer delay
      // gives the webhook time to land and cancel it. Without realtime, the
      // refetch is the only update path, so fire it promptly.
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
