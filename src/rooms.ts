import { isHub } from "./deviceRegistry";
import { t } from "./i18n";
import type { Device, InfraredDevice } from "./types";

export interface RoomDevice {
  device: Device | InfraredDevice;
  isInfrared: boolean;
}

export interface Room {
  /** Hub deviceId, or "" for the fallback room. Unique even when two hubs
   *  reduce to the same room name, so it is safe to use as a React key. */
  id: string;
  name: string;
  devices: RoomDevice[];
}

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
    let match = "";
    let matchLength = -1;
    for (const [hubId, room] of hubMap) {
      if (name.startsWith(room) && room.length > matchLength) {
        match = hubId;
        matchLength = room.length;
      }
    }
    return match;
  }

  const roomMap = new Map<string, RoomDevice[]>();
  function add(key: string, device: Device | InfraredDevice, isInfrared: boolean) {
    let devices = roomMap.get(key);
    if (!devices) {
      devices = [];
      roomMap.set(key, devices);
    }
    devices.push({ device, isInfrared });
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

  const fallback = t("room.other");
  const rooms: Room[] = [];
  for (const [key, devs] of roomMap) {
    const name = key ? hubMap.get(key) || key : fallback;
    rooms.push({ id: key, name, devices: devs });
  }
  rooms.sort((a, b) => {
    if (a.name === fallback) return 1;
    if (b.name === fallback) return -1;
    return a.name.localeCompare(b.name);
  });
  return rooms;
}
