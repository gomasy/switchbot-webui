import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDevices, getScenes, executeScene } from "./api";
import type { Device, DeviceStatus, InfraredDevice, Scene } from "./types";
import { Header } from "./components/Header";
import { DeviceCard } from "./components/DeviceCard";
import { DeviceDetail } from "./components/DeviceDetail";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

interface RoomDevice {
  device: Device | InfraredDevice;
  isInfrared: boolean;
}

interface Room {
  name: string;
  devices: RoomDevice[];
}

type Tab = "home" | "scenes";

function roomName(hubName: string): string {
  return (
    hubName
      .replace(/\s*(ハブ|Hub)\s*(Mini|Plus|2|3)?\s*$/i, "")
      .trim() || hubName
  );
}

function getInitialTheme(): boolean {
  const saved = localStorage.getItem("theme");
  if (saved) return saved === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function App() {
  const [darkMode, setDarkMode] = useState(getInitialTheme);
  const [devices, setDevices] = useState<Device[]>([]);
  const [irDevices, setIrDevices] = useState<InfraredDevice[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<{
    device: Device | InfraredDevice;
    isInfrared: boolean;
  } | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [executingScene, setExecutingScene] = useState<string | null>(null);
  const [deviceStatuses, setDeviceStatuses] = useState<Record<string, DeviceStatus>>({});
  const toastId = useRef(0);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const rooms = useMemo(() => {
    const hubMap = new Map<string, string>();
    for (const d of devices) {
      if (d.deviceType.toLowerCase().includes("hub")) {
        hubMap.set(d.deviceId, roomName(d.deviceName));
      }
    }

    function findHubByName(name: string): string | null {
      for (const [hubId, room] of hubMap) {
        if (name.startsWith(room)) return hubId;
      }
      return null;
    }

    const roomMap = new Map<string, RoomDevice[]>();
    function add(
      key: string,
      dev: Device | InfraredDevice,
      isIr: boolean,
    ) {
      if (!roomMap.has(key)) roomMap.set(key, []);
      roomMap.get(key)!.push({ device: dev, isInfrared: isIr });
    }

    for (const d of devices) {
      if (d.deviceType.toLowerCase().includes("hub")) {
        add(d.deviceId, d, false);
      } else if (d.hubDeviceId) {
        add(d.hubDeviceId, d, false);
      } else {
        add(findHubByName(d.deviceName) || "", d, false);
      }
    }
    for (const d of irDevices) {
      if (d.hubDeviceId) {
        add(d.hubDeviceId, d, true);
      } else {
        add(findHubByName(d.deviceName) || "", d, true);
      }
    }

    const result: Room[] = [];
    for (const [key, devs] of roomMap) {
      const name = key ? hubMap.get(key) || key : "その他";
      result.push({ name, devices: devs });
    }
    result.sort((a, b) => {
      if (a.name === "その他") return 1;
      if (b.name === "その他") return -1;
      return a.name.localeCompare(b.name);
    });
    return result;
  }, [devices, irDevices]);

  const addToast = useCallback(
    (message: string, type: "success" | "error") => {
      const id = ++toastId.current;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    },
    [],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [devRes, sceneRes] = await Promise.all([
        getDevices(),
        getScenes(),
      ]);
      if (devRes.statusCode === 100) {
        setDevices(devRes.body.deviceList || []);
        setIrDevices(devRes.body.infraredRemoteList || []);
      } else {
        setError(devRes.message || "デバイスの取得に失敗しました");
      }
      if (sceneRes.statusCode === 100) {
        setScenes(sceneRes.body || []);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "接続に失敗しました",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExecuteScene = async (sceneId: string) => {
    if (executingScene) return;
    setExecutingScene(sceneId);
    try {
      const res = await executeScene(sceneId);
      if (res.statusCode === 100) {
        addToast("シーンを実行しました", "success");
      } else {
        addToast(`エラー: ${res.message}`, "error");
      }
    } catch {
      addToast("シーンの実行に失敗しました", "error");
    } finally {
      setExecutingScene(null);
    }
  };

  return (
    <>
      <Header
        loading={loading}
        onRefresh={fetchData}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((v) => !v)}
      />

      <main className="main">
        {error ? (
          <div className="error-message">
            <p>{error}</p>
            <button onClick={fetchData}>再試行</button>
          </div>
        ) : loading && devices.length === 0 ? (
          <div className="loading">
            <div className="spinner" />
            <span>デバイスを読み込み中...</span>
          </div>
        ) : tab === "home" ? (
          rooms.length > 0 ? (
            rooms.map((room) => (
              <div key={room.name} style={{ marginBottom: 24 }}>
                <div className="section-title">{room.name}</div>
                <div className="device-grid">
                  {room.devices.map(({ device, isInfrared }) => (
                    <DeviceCard
                      key={device.deviceId}
                      device={device}
                      isInfrared={isInfrared}
                      externalStatus={deviceStatuses[device.deviceId]}
                      onClick={() =>
                        setSelectedDevice({ device, isInfrared })
                      }
                      onToast={addToast}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📱</div>
              <div className="empty-state-text">
                デバイスが見つかりません
              </div>
            </div>
          )
        ) : (
          <>
            <div className="section-title">シーン</div>
            {scenes.length > 0 ? (
              <div className="scene-list">
                {scenes.map((s) => (
                  <div key={s.sceneId} className="scene-card">
                    <div className="scene-card-left">
                      <span className="scene-card-icon">⚡</span>
                      <span className="scene-card-name">
                        {s.sceneName}
                      </span>
                    </div>
                    <button
                      className="scene-card-run"
                      onClick={() => handleExecuteScene(s.sceneId)}
                      disabled={executingScene === s.sceneId}
                    >
                      {executingScene === s.sceneId
                        ? "実行中..."
                        : "実行"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">⚡</div>
                <div className="empty-state-text">
                  シーンが見つかりません
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <nav className="bottom-nav">
        <button
          className={`nav-item ${tab === "home" ? "active" : ""}`}
          onClick={() => setTab("home")}
        >
          <span className="nav-icon">🏠</span>
          ホーム
        </button>
        <button
          className={`nav-item ${tab === "scenes" ? "active" : ""}`}
          onClick={() => setTab("scenes")}
        >
          <span className="nav-icon">⚡</span>
          シーン
        </button>
      </nav>

      {selectedDevice && (
        <DeviceDetail
          device={selectedDevice.device}
          isInfrared={selectedDevice.isInfrared}
          onClose={(updatedStatus) => {
            if (updatedStatus) {
              setDeviceStatuses((prev) => ({
                ...prev,
                [selectedDevice.device.deviceId]: updatedStatus,
              }));
            }
            setSelectedDevice(null);
          }}
          onToast={addToast}
        />
      )}

      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}
