import { useEffect, useRef } from "react";
import { normalizeStatusCase } from "./status";
import type { DeviceStatus } from "./types";

/** A subset of DeviceStatus derived from a webhook, always carrying deviceId. */
export type StatusUpdate = Partial<DeviceStatus> & { deviceId: string };

/** Fields carried straight across from the webhook when present, by type. */
const NUMBER_FIELDS = [
  "temperature",
  "humidity",
  "battery",
  "brightness",
  "colorTemperature",
  "slidePosition",
  "nebulizationEfficiency",
  "switchStatus",
  "switch1Status",
  "switch2Status",
];
const STRING_FIELDS = [
  "deviceType",
  "color",
  "openState",
  "workingStatus",
  "onlineStatus",
  "lockState",
  "doorState",
];

/**
 * Map a SwitchBot webhook `context` object onto the DeviceStatus fields the UI
 * renders. Webhook payloads vary by device type, so every field is optional and
 * only copied when present. Returns null when the device can't be identified.
 */
export function normalizeWebhook(ctx: Record<string, unknown>): StatusUpdate | null {
  const deviceId = typeof ctx.deviceMac === "string" ? ctx.deviceMac : null;
  if (!deviceId) return null;

  const out: StatusUpdate = { deviceId };
  const sink = out as Record<string, unknown>;

  for (const field of NUMBER_FIELDS) {
    if (typeof ctx[field] === "number") sink[field] = ctx[field];
  }
  for (const field of STRING_FIELDS) {
    if (typeof ctx[field] === "string") sink[field] = ctx[field];
  }

  // Webhooks name it powerState; a few payloads use power. Prefer powerState
  // when it is present and usable.
  const power =
    typeof ctx.powerState === "string" ? ctx.powerState : ctx.power;
  if (typeof power === "string") out.power = power;

  if (typeof ctx.detectionState === "number") {
    out.waterDetected = ctx.detectionState === 1;
  } else if (typeof ctx.detectionState === "string") {
    out.moveDetected = ctx.detectionState === "DETECTED";
  }
  if (!out.power && typeof out.switchStatus === "number") {
    out.power = out.switchStatus === 1 ? "on" : "off";
  }

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
