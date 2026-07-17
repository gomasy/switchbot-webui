import { useCallback, useRef, useState } from "react";
import { sendCommand } from "./api";
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
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return { toasts, addToast };
}

/**
 * デバイスへのコマンド送信を共通化するフック。
 * 多重送信の防止とエラートーストを引き受け、成功時のみ true を返す。
 */
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
      onToast(`エラー: ${res.message}`, "error");
    } catch {
      onToast("コマンドの送信に失敗しました", "error");
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
        // localStorage が使えない環境では保存を諦める
      }
    },
    [key],
  );

  return [value, set] as const;
}
