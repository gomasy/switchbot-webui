import { useCallback, useEffect, useRef, useState } from "react";
import { sendCommand, UnauthorizedError } from "./api";
import { t, tFmt } from "./i18n";
import { readStorage, writeStorage } from "./storage";
import type {
  Device,
  DeviceStatus,
  InfraredDevice,
  ToastFn,
  ToastType,
} from "./types";

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const addToast = useCallback<ToastFn>((message, type) => {
    const id = ++nextId.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  }, []);

  return { toasts, addToast };
}

/** Elements that can hold keyboard focus inside a modal. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Wire up the shared modal behaviour: close on Escape or browser back, lock
 * background scrolling, and keep keyboard focus inside the dialog until it
 * closes. Attach the returned ref to the dialog element.
 */
export function useModalClose(close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.add("modal-open");
    history.pushState({ modal: true }, "");
    // Focus moves into the dialog, so remember where to put it back.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    let popped = false;
    const onPop = () => {
      popped = true;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      // Cycle within the dialog instead of tabbing out to the page behind it.
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      const first = items[0] ?? dialog;
      const last = items[items.length - 1] ?? dialog;
      const active = document.activeElement;
      if (!dialog.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
      if (!popped) history.back();
    };
  }, []);

  return dialogRef;
}

export function useSendCommand(deviceId: string, onToast: ToastFn) {
  const [sending, setSending] = useState(false);
  // The guard reads a ref, not the state: two clicks in the same tick both see
  // the state value from the last render and would otherwise send twice.
  const inFlight = useRef(false);

  const send = async (
    command: string,
    parameter: unknown = "default",
    commandType = "command",
  ): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setSending(true);
    try {
      const res = await sendCommand(deviceId, command, parameter, commandType);
      if (res.statusCode === 100) return true;
      onToast(tFmt("common.error", { message: res.message }), "error");
    } catch (e) {
      // Unauthorized is handled globally; avoid a misleading failure toast.
      if (!(e instanceof UnauthorizedError)) {
        onToast(t("common.commandFailed"), "error");
      }
    } finally {
      inFlight.current = false;
      setSending(false);
    }
    return false;
  };

  return { sending, send };
}

export interface LiveStatus {
  status: DeviceStatus | null;
  /**
   * The current change version. Read it before an await to detect whether a
   * realtime update landed while the request was in flight.
   */
  version: () => number;
  /** Apply an optimistic local change, held until a newer fetch overtakes it. */
  applyLocal: (fields: Partial<DeviceStatus>) => void;
  /**
   * Apply an authoritative fetch, re-applying every change newer than `since`
   * (the version read before the request was issued).
   */
  applyFetched: (body: DeviceStatus, since: number) => void;
}

/**
 * Track a device status written from three directions: authoritative fetches,
 * realtime webhook updates, and optimistic local edits. Each non-fetch write
 * bumps a version and is remembered per field, so a fetch that was already in
 * flight when one happened re-applies it instead of reverting the UI to a
 * value the server had not observed yet.
 */
export function useLiveStatus(
  device: Device | InfraredDevice,
  externalStatus?: DeviceStatus | null,
): LiveStatus {
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const versionRef = useRef(0);
  const changes = useRef<Record<string, { version: number; value: unknown }>>(
    {},
  );
  // An external status already present at mount predates this component, so it
  // is merged for an immediate first paint but not recorded as a change: the
  // first fetch is the newer truth and must be allowed to replace it.
  const initialExternal = useRef(externalStatus);
  const deviceRef = useRef(device);
  deviceRef.current = device;

  // Merge, never replace: realtime updates are partial, so fields the status
  // already carries have to survive one. The identity fields keep the result a
  // well-formed status even when nothing has been fetched yet.
  const merge = useCallback((fields: Partial<DeviceStatus>) => {
    const d = deviceRef.current;
    setStatus((prev) => ({
      deviceId: d.deviceId,
      deviceType: "deviceType" in d ? d.deviceType : "",
      hubDeviceId: d.hubDeviceId,
      ...prev,
      ...fields,
    }));
  }, []);

  const applyLocal = useCallback(
    (fields: Partial<DeviceStatus>) => {
      const version = ++versionRef.current;
      for (const [field, value] of Object.entries(fields)) {
        changes.current[field] = { version, value };
      }
      merge(fields);
    },
    [merge],
  );

  const applyFetched = useCallback((body: DeviceStatus, since: number) => {
    const newer: Record<string, unknown> = {};
    for (const [field, change] of Object.entries(changes.current)) {
      if (change.version > since) newer[field] = change.value;
    }
    setStatus({ ...body, ...newer });
  }, []);

  const version = useCallback(() => versionRef.current, []);

  useEffect(() => {
    if (!externalStatus) return;
    if (initialExternal.current === externalStatus) {
      initialExternal.current = undefined;
      merge(externalStatus);
      return;
    }
    applyLocal(externalStatus);
  }, [externalStatus, applyLocal, merge]);

  return { status, version, applyLocal, applyFetched };
}

export function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    const raw = readStorage(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // A value written by an older version may no longer parse.
      return fallback;
    }
  });

  const set = useCallback(
    (next: T) => {
      setValue(next);
      writeStorage(key, JSON.stringify(next));
    },
    [key],
  );

  return [value, set] as const;
}
