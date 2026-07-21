import { isHub } from "./deviceRegistry";
import { t } from "./i18n";
import type { Device, InfraredDevice } from "./types";

export interface RoomDevice {
  device: Device | InfraredDevice;
  isInfrared: boolean;
}

export interface Room {
  name: string;
  devices: RoomDevice[];
}

const FALLBACK_ROOM = t("room.other");

function roomName(hubName: string): string {
  return (
    hubName.replace(/\s*(ハブ|Hub)\s*(Mini|Plus|2|3)?\s*$/i, "").trim() ||
    hubName
  );
}

/**
 * Group devices by hub (= room).
 * Devices without hubDeviceId are matched by name prefix against hub room names;
 * unmatched devices go into the fallback room.
 */
export function groupRooms(
  devices: Device[],
  irDevices: InfraredDevice[],
): Room[] {
  const hubMap = new Map<string, string>();
  for (const d of devices) {
    if (isHub(d.deviceType)) {
      hubMap.set(d.deviceId, roomName(d.deviceName));
    }
  }

  function findHubByName(name: string): string {
    for (const [hubId, room] of hubMap) {
      if (name.startsWith(room)) return hubId;
    }
    return "";
  }

  const roomMap = new Map<string, RoomDevice[]>();
  function add(key: string, device: Device | InfraredDevice, isInfrared: boolean) {
    if (!roomMap.has(key)) roomMap.set(key, []);
    roomMap.get(key)!.push({ device, isInfrared });
  }

  for (const d of devices) {
    if (isHub(d.deviceType)) {
      add(d.deviceId, d, false);
    } else {
      add(d.hubDeviceId || findHubByName(d.deviceName), d, false);
    }
  }
  for (const d of irDevices) {
    add(d.hubDeviceId || findHubByName(d.deviceName), d, true);
  }

  const rooms: Room[] = [];
  for (const [key, devs] of roomMap) {
    const name = key ? hubMap.get(key) || key : FALLBACK_ROOM;
    rooms.push({ name, devices: devs });
  }
  rooms.sort((a, b) => {
    if (a.name === FALLBACK_ROOM) return 1;
    if (b.name === FALLBACK_ROOM) return -1;
    return a.name.localeCompare(b.name);
  });
  return rooms;
}
