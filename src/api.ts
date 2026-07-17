import type { ApiResponse, DeviceListBody, DeviceStatus, Scene } from "./types";

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
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
