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
  power?: string;
  temperature?: number;
  humidity?: number;
  brightness?: number;
  color?: string;
  colorTemperature?: number;
  voltage?: number;
  weight?: number;
  electricityOfDay?: number;
  electricCurrent?: number;
  battery?: number;
  version?: string;
  lockState?: string;
  doorState?: string;
  moveDetected?: boolean;
  openState?: string;
  slidePosition?: number;
  calibrate?: boolean;
  group?: boolean;
  moving?: boolean;
  nebulizationEfficiency?: number;
  auto?: boolean;
  lackWater?: boolean;
  workingStatus?: string;
  onlineStatus?: string;
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
