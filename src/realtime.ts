import { useEffect, useRef } from "react";
import { normalizeStatusCase } from "./status";
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
  copyNum("nebulizationEfficiency");

  copyStr("color");
  copyStr("openState");
  copyStr("workingStatus");
  copyStr("onlineStatus");
  copyStr("lockState");
  copyStr("doorState");
  // Webhooks name it powerState; a few payloads use power. Copy powerState
  // last so it wins when both are present.
  copyStr("power");
  copyStr("powerState", "power");

  const detectionState = typeof ctx.detectionState === "string" ? ctx.detectionState : null;
  if (detectionState) out.moveDetected = detectionState === "DETECTED";

  return normalizeStatusCase(out);
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
  onReconnect: () => void,
): void {
  const onUpdateRef = useRef(onUpdate);
  const onReconnectRef = useRef(onReconnect);
  onUpdateRef.current = onUpdate;
  onReconnectRef.current = onReconnect;

  useEffect(() => {
    if (!enabled) return;

    let socket: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let timer: number | undefined;
    let needsResync = false;

    const connect = () => {
      if (stopped) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      // Bind handlers to this socket, not to the mutable `socket` slot, so a
      // late event from a replaced socket cannot close its successor.
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      socket = ws;

      ws.onopen = () => {
        // Events are dropped while disconnected, so a resumed connection has
        // to re-read every status rather than trust what is on screen.
        if (needsResync) onReconnectRef.current();
        needsResync = false;
        attempt = 0;
      };
      ws.onmessage = (ev) => {
        try {
          const update = normalizeWebhook(JSON.parse(ev.data));
          if (update) onUpdateRef.current(update);
        } catch {
          // Ignore malformed frames.
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        needsResync = true;
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt);
        attempt += 1;
        // Jitter: a server restart drops every client at once, and without it
        // they would all come back in the same instant, again and again.
        timer = window.setTimeout(connect, delay * (0.5 + Math.random() * 0.5));
      };
      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [enabled]);
}
