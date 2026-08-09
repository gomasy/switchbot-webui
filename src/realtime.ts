import { useEffect, useRef } from "react";
import { getCategory } from "./deviceRegistry";
import { normalizeDeviceStatus } from "./status";
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
  "doorStatus",
  "CO2",
  "lightLevel",
  "fanSpeed",
  "position",
  "waterBaseBattery",
  "colorLightBrightness",
];
const STRING_FIELDS = [
  "deviceType",
  "color",
  "openState",
  "workingStatus",
  "taskType",
  "onlineStatus",
  "lockState",
  "doorState",
  "direction",
  "nightStatus",
  "oscillation",
  "verticalOscillation",
  "chargingStatus",
  "isStuck",
];
const BOOLEAN_FIELDS = ["moveDetected", "drying", "calibrate", "group", "moving", "online"];
/** Fields the API reports in more than one shape, so they are copied as-is. */
const ANY_FIELDS = ["mode", "childLock"];
/** Webhook names for fields the status API spells differently. */
const RENAMED_FIELDS: [string, string][] = [
  ["colorLightPowerState", "colorLightPower"],
  ["colorLightColor", "colorLightRGB"],
];
/**
 * A dual-channel light reports its main channel under the plain light field
 * names in webhooks, but under mainLight* in the status API. Rename them so
 * both paths feed the same controls.
 */
const MAIN_LIGHT_FIELDS: [string, string][] = [
  ["power", "mainLightPower"],
  ["brightness", "mainLightBrightness"],
  ["colorTemperature", "mainLightColorTemp"],
];

/**
 * Map a SwitchBot webhook `context` onto the DeviceStatus fields the UI renders.
 * Payloads vary by device type, so every field is copied only when present.
 * Returns null when the device can't be identified.
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
  for (const field of BOOLEAN_FIELDS) {
    if (typeof ctx[field] === "boolean") sink[field] = ctx[field];
  }
  for (const field of ANY_FIELDS) {
    const value = ctx[field];
    if (value !== undefined && value !== null) sink[field] = value;
  }
  for (const [from, to] of RENAMED_FIELDS) {
    if (ctx[from] !== undefined) sink[to] = ctx[from];
  }

  // Webhooks name it powerState; a few payloads use power. Prefer powerState
  // when it is present, and leave a numeric power to normalizeDeviceStatus,
  // which knows it is a wattage rather than a state.
  const power = ctx.powerState !== undefined ? ctx.powerState : ctx.power;
  if (typeof power === "string" || typeof power === "number") sink.power = power;

  // Done after `power` is resolved above, since the main light's state arrives
  // as the payload's plain powerState.
  if (getCategory(out.deviceType) === "dualLight") {
    for (const [from, to] of MAIN_LIGHT_FIELDS) {
      if (sink[from] !== undefined) {
        sink[to] = sink[from];
        delete sink[from];
      }
    }
  }

  if (typeof ctx.detectionState === "number") {
    out.waterDetected = ctx.detectionState === 1;
  } else if (typeof ctx.detectionState === "string") {
    const detected = ctx.detectionState === "DETECTED";
    // The Presence Sensor reports occupancy, which its status API calls
    // Detected; every other sensor reporting this field means motion.
    if (getCategory(out.deviceType) === "presence") out.Detected = detected;
    else out.moveDetected = detected;
  }

  return normalizeDeviceStatus(out);
}

const MAX_BACKOFF_MS = 30_000;

/**
 * Keep a WebSocket to `/ws` open while `enabled`, delivering each normalized
 * update to `onUpdate`. Reconnects with exponential backoff so transient drops
 * (sleep/wake, network blips) recover on their own.
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
      if (timer !== undefined) clearTimeout(timer);
      socket?.close();
    };
  }, [enabled]);
}
