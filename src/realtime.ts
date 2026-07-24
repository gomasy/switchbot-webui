import { useEffect, useRef } from "react";
import type { DeviceStatus } from "./types";

/** A subset of DeviceStatus derived from a webhook, always carrying deviceId. */
export type StatusUpdate = Partial<DeviceStatus> & { deviceId: string };

/**
 * Map a SwitchBot webhook `context` object onto the DeviceStatus fields the UI
 * renders. Webhook payloads vary by device type, so every field is optional and
 * only copied when present. Returns null when the device can't be identified.
 */
export function normalizeWebhook(ctx: Record<string, unknown>): StatusUpdate | null {
  const deviceId = typeof ctx.deviceMac === "string" ? ctx.deviceMac : null;
  if (!deviceId) return null;

  const out: StatusUpdate = { deviceId };

  const copyNum = (src: string, dst: keyof StatusUpdate = src as keyof StatusUpdate) => {
    if (typeof ctx[src] === "number") (out as Record<string, unknown>)[dst] = ctx[src];
  };
  const copyStr = (src: string, dst: keyof StatusUpdate = src as keyof StatusUpdate) => {
    if (typeof ctx[src] === "string") (out as Record<string, unknown>)[dst] = ctx[src];
  };

  copyNum("temperature");
  copyNum("humidity");
  copyNum("battery");
  copyNum("brightness");
  copyNum("colorTemperature");
  copyNum("slidePosition");

  copyStr("color");
  copyStr("openState");
  copyStr("workingStatus");
  copyStr("onlineStatus");

  // SwitchBot reports power as "ON"/"OFF"; the UI compares against "on".
  const power =
    (typeof ctx.powerState === "string" ? ctx.powerState : null) ??
    (typeof ctx.power === "string" ? ctx.power : null);
  if (power) out.power = power.toLowerCase();
  const lockState = typeof ctx.lockState === "string" ? ctx.lockState : null;
  if (lockState) out.lockState = lockState.toLowerCase();
  const detectionState = typeof ctx.detectionState === "string" ? ctx.detectionState : null;
  if (detectionState) out.moveDetected = detectionState === "DETECTED";

  return out;
}

const MAX_BACKOFF_MS = 30_000;

/**
 * Keep a WebSocket to `/ws` open while `enabled` is true and deliver each
 * normalized device update to `onUpdate`. Reconnects with exponential backoff
 * so transient drops (sleep/wake, network blips) recover on their own.
 */
export function useRealtime(
  enabled: boolean,
  onUpdate: (update: StatusUpdate) => void,
): void {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!enabled) return;

    let socket: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let timer: number | undefined;

    const connect = () => {
      if (stopped) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${proto}://${location.host}/ws`);

      socket.onopen = () => {
        attempt = 0;
      };
      socket.onmessage = (ev) => {
        try {
          const update = normalizeWebhook(JSON.parse(ev.data));
          if (update) onUpdateRef.current(update);
        } catch {
          // Ignore malformed frames.
        }
      };
      socket.onclose = () => {
        if (stopped) return;
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt);
        attempt += 1;
        timer = window.setTimeout(connect, delay);
      };
      socket.onerror = () => socket?.close();
    };

    connect();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [enabled]);
}
