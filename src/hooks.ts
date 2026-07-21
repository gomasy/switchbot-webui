import { useCallback, useEffect, useRef, useState } from "react";
import { sendCommand } from "./api";
import { t, tFmt } from "./i18n";
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

export function useModalClose(close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    document.body.classList.add("modal-open");
    history.pushState({ modal: true }, "");
    let popped = false;
    const onPop = () => {
      popped = true;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      if (!popped) history.back();
    };
  }, []);
}

export function useSendCommand(deviceId: string, onToast: ToastFn) {
  const [sending, setSending] = useState(false);

  const send = async (
    command: string,
    parameter: unknown = "default",
    commandType = "command",
  ): Promise<boolean> => {
    if (sending) return false;
    setSending(true);
    try {
      const res = await sendCommand(deviceId, command, parameter, commandType);
      if (res.statusCode === 100) return true;
      onToast(tFmt("common.error", { message: res.message }), "error");
    } catch {
      onToast(t("common.commandFailed"), "error");
    } finally {
      setSending(false);
    }
    return false;
  };

  return { sending, send };
}

export function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  });

  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    [key],
  );

  return [value, set] as const;
}
