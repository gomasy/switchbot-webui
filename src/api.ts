import type { ApiResponse, DeviceListBody, DeviceStatus, Scene } from "./types";

async function apiGet<T>(path: string): Promise<ApiResponse<T>> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function apiPost<T>(
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getDevices() {
  return apiGet<DeviceListBody>("/v1.1/devices");
}

export async function getDeviceStatus(deviceId: string) {
  return apiGet<DeviceStatus>(`/v1.1/devices/${deviceId}/status`);
}

export async function sendCommand(
  deviceId: string,
  command: string,
  parameter: unknown = "default",
  commandType = "command",
) {
  return apiPost(`/v1.1/devices/${deviceId}/commands`, {
    command,
    parameter,
    commandType,
  });
}

export async function getScenes() {
  return apiGet<Scene[]>("/v1.1/scenes");
}

export async function executeScene(sceneId: string) {
  return apiPost(`/v1.1/scenes/${sceneId}/execute`);
}
