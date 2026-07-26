import { useCallback, useEffect, useRef, useState } from "react";
import { sendCommand, UnauthorizedError } from "./api";
import { t, tFmt } from "./i18n";
import { readStorage, writeStorage } from "./storage";
import type { ToastFn, ToastType } from "./types";

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
