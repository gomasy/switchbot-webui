import type { ApiResponse, DeviceListBody, DeviceStatus, Scene } from "./types";

/** サーバーの AUTH_TOKEN 認証に失敗した (ログインが必要な) ことを表す */
export class UnauthorizedError extends Error {
  constructor() {
    super("認証が必要です");
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  const res = await fetch(`/api${path}`, init);
  // WWW-Authenticate 付き 401 はプロキシ自体の認証拒否 (上流 API の 401 と区別する)
  if (res.status === 401 && res.headers.has("WWW-Authenticate")) {
    throw new UnauthorizedError();
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/** アクセストークンを送信して認証 Cookie を取得する。成功時 true */
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
