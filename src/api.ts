import { t } from "./i18n";
import type { ApiResponse, DeviceListBody, DeviceStatus, Scene } from "./types";

export class UnauthorizedError extends Error {
  constructor() {
    super(t("api.unauthorized"));
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  const res = await fetch(`/api${path}`, init);
  // WWW-Authenticate on 401 distinguishes our proxy auth rejection from upstream API 401s
  if (res.status === 401 && res.headers.has("WWW-Authenticate")) {
    throw new UnauthorizedError();
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/** Submit an access token and obtain an auth cookie. Returns true on success. */
export async function login(token: string): Promise<boolean> {
  const res = await fetch("/auth/login", { method: "POST", body: token });
  return res.ok;
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

export function getDeviceStatus(deviceId: string) {
  return request<DeviceStatus>(`/v1.1/devices/${deviceId}/status`);
}

export function sendCommand(
  deviceId: string,
  command: string,
  parameter: unknown = "default",
  commandType = "command",
) {
  return post(`/v1.1/devices/${deviceId}/commands`, {
    command,
    parameter,
    commandType,
  });
}

export function getScenes() {
  return request<Scene[]>("/v1.1/scenes");
}

export function executeScene(sceneId: string) {
  return post(`/v1.1/scenes/${sceneId}/execute`);
}
