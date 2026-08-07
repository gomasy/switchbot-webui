import { t } from "./i18n";
import { normalizeDeviceStatus } from "./status";
import type { ApiResponse, DeviceListBody, DeviceStatus, Scene } from "./types";

export class UnauthorizedError extends Error {
  constructor() {
    super(t("api.unauthorized"));
  }
}

let onUnauthorized: (() => void) | null = null;

/**
 * Centralizes the "session expired → show login" decision, so every caller
 * (including background status fetches) reacts uniformly.
 */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  const res = await fetch(`/api${path}`, init);
  // WWW-Authenticate marks the proxy's own rejection, not an upstream 401.
  if (res.status === 401 && res.headers.has("WWW-Authenticate")) {
    onUnauthorized?.();
    throw new UnauthorizedError();
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function login(token: string): Promise<boolean> {
  const res = await fetch("/auth/login", { method: "POST", body: token });
  return res.ok;
}

export async function logout(): Promise<void> {
  const res = await fetch("/auth/logout", { method: "POST" });
  if (!res.ok) throw new Error(`logout: ${res.status}`);
}

/** Server-side flags the app needs before rendering. */
export interface AppConfig {
  authEnabled: boolean;
  /** Whether the server pushes realtime device updates over WebSocket. */
  realtime: boolean;
}

export async function getConfig(): Promise<AppConfig> {
  const res = await fetch("/config");
  if (!res.ok) throw new Error(`config: ${res.status}`);
  return res.json();
}

function post<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function getDevices() {
  return request<DeviceListBody>("/v1.1/devices");
}

export async function getDeviceStatus(deviceId: string) {
  const res = await request<DeviceStatus>(
    `/v1.1/devices/${encodeURIComponent(deviceId)}/status`,
  );
  if (res.body) normalizeDeviceStatus(res.body);
  return res;
}

export function sendCommand(
  deviceId: string,
  command: string,
  parameter: unknown = "default",
  commandType = "command",
) {
  return post(`/v1.1/devices/${encodeURIComponent(deviceId)}/commands`, {
    command,
    parameter,
    commandType,
  });
}

export function getScenes() {
  return request<Scene[]>("/v1.1/scenes");
}

export function executeScene(sceneId: string) {
  return post(`/v1.1/scenes/${encodeURIComponent(sceneId)}/execute`);
}
