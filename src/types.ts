export interface Device {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  enableCloudService: boolean;
  hubDeviceId: string;
}

export interface InfraredDevice {
  deviceId: string;
  deviceName: string;
  remoteType: string;
  hubDeviceId: string;
}

export interface DeviceStatus {
  deviceId: string;
  deviceType: string;
  hubDeviceId: string;
  /** On/off state. Metering devices report watts here; `normalizeDeviceStatus`
   *  moves that to `weight`, so by the time a status reaches the UI this is
   *  only ever a state string. */
  power?: string;
  temperature?: number;
  humidity?: number;
  /** A percentage on lights, but "bright"/"dim" on motion and contact sensors. */
  brightness?: number | string;
  color?: string;
  colorTemperature?: number;
  voltage?: number;
  weight?: number;
  electricityOfDay?: number;
  electricCurrent?: number;
  /** Daily consumption in watt-minutes, reported by the metering relays/plugs. */
  usedElectricity?: number;
  status?: number;
  waterDetected?: boolean;
  switchStatus?: number;
  switch1Status?: number;
  switch2Status?: number;
  /** Garage Door Opener's switch state, inverted: 0 is on, 1 is off. */
  doorStatus?: number;
  online?: boolean;
  battery?: number;
  version?: string;
  lockState?: string;
  doorState?: string;
  moveDetected?: boolean;
  /** Presence Sensor's own detection flag, spelled with a capital D upstream. */
  Detected?: boolean;
  openState?: string;
  slidePosition?: number;
  /** Blind Tilt's opening direction, which its setPosition parameter needs. */
  direction?: string;
  calibrate?: boolean;
  group?: boolean;
  moving?: boolean;
  nebulizationEfficiency?: number;
  auto?: boolean;
  lackWater?: boolean;
  workingStatus?: string;
  taskType?: string;
  onlineStatus?: string;
  chargingStatus?: string;
  waterBaseBattery?: number;
  CO2?: number;
  lightLevel?: number;
  /** Numeric on climate panels, but "bright"/"dim" on motion/contact sensors. */
  mode?: number | string;
  fanSpeed?: number;
  nightStatus?: string;
  oscillation?: string;
  verticalOscillation?: string;
  childLock?: boolean | number | string;
  drying?: boolean;
  filterElement?: { effectiveUsageHours?: number; usedHours?: number };
  /** Relay Switch 2PM in roller-blind mode. */
  position?: number;
  isStuck?: string;
  /** RGBICWW Ceiling Light's two independently controlled light channels. */
  mainLightPower?: string;
  mainLightBrightness?: number;
  mainLightColorTemp?: number;
  colorLightPower?: string;
  colorLightBrightness?: number;
  colorLightRGB?: string;
  [key: string]: unknown;
}

export interface Scene {
  sceneId: string;
  sceneName: string;
}

export type ToastType = "success" | "error";
export type ToastFn = (message: string, type: ToastType) => void;

export interface ApiResponse<T> {
  statusCode: number;
  body: T;
  message: string;
}

export interface DeviceListBody {
  deviceList: Device[];
  infraredRemoteList: InfraredDevice[];
}
