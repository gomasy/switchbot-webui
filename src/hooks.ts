import { useCallback, useEffect, useRef, useState } from "react";
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
 * モーダルの表示中制御をまとめたフック。
 * body スクロールを固定し、履歴を 1 つ積んでブラウザバック/Esc で close を呼ぶ。
 */
export function useModalClose(close: () => void) {
  // リスナーは初回マウント時のものが使われ続けるため、最新の close を ref で参照する
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    document.body.classList.add("modal-open");
    // スマホの「戻る」やブラウザバックで閉じられるよう履歴を 1 つ積む
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
      // ✕ や Esc で閉じた場合は積んだ履歴を消費して整合を保つ
      if (!popped) history.back();
    };
  }, []);
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
