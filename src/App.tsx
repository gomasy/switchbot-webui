import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDevices, getScenes, executeScene, UnauthorizedError } from "./api";
import { useToasts } from "./hooks";
import { groupRooms, type RoomDevice } from "./rooms";
import type { Device, DeviceStatus, InfraredDevice, Scene } from "./types";
import { Header } from "./components/Header";
import { DeviceCard } from "./components/DeviceCard";
import { DeviceDetail } from "./components/DeviceDetail";
import { LoginScreen } from "./components/LoginScreen";
import { SceneList } from "./components/SceneList";

type Tab = "home" | "scenes";

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
  const [selectedDevice, setSelectedDevice] = useState<RoomDevice | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executingScene, setExecutingScene] = useState<string | null>(null);
  const [deviceStatuses, setDeviceStatuses] = useState<Record<string, DeviceStatus>>({});
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [needsLogin, setNeedsLogin] = useState(false);
  const { toasts, addToast } = useToasts();

  useEffect(() => {
    const theme = darkMode ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [darkMode]);

  const rooms = useMemo(() => groupRooms(devices, irDevices), [devices, irDevices]);

  const lastFetch = useRef(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    lastFetch.current = Date.now();
    // マウント済みの DeviceCard にもステータス再取得を促す
    setRefreshSignal((n) => n + 1);
    try {
      const [devRes, sceneRes] = await Promise.all([getDevices(), getScenes()]);
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
      if (e instanceof UnauthorizedError) {
        setNeedsLogin(true);
      } else {
        setError(e instanceof Error ? e.message : "接続に失敗しました");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // タブに戻ってきたとき、前回取得から 1 分以上経っていれば自動で更新する
  useEffect(() => {
    if (needsLogin) return;
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastFetch.current > 60_000
      ) {
        fetchData();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchData, needsLogin]);

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
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        setNeedsLogin(true);
      } else {
        addToast("シーンの実行に失敗しました", "error");
      }
    } finally {
      setExecutingScene(null);
    }
  };

  if (needsLogin) {
    return (
      <LoginScreen
        onSuccess={() => {
          setNeedsLogin(false);
          fetchData();
        }}
      />
    );
  }

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
              <div key={room.name} className="room-section">
                <div className="section-title">{room.name}</div>
                <div className="device-grid">
                  {room.devices.map(({ device, isInfrared }) => (
                    <DeviceCard
                      key={device.deviceId}
                      device={device}
                      isInfrared={isInfrared}
                      externalStatus={deviceStatuses[device.deviceId]}
                      refreshSignal={refreshSignal}
                      onClick={() => setSelectedDevice({ device, isInfrared })}
                      onToast={addToast}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📱</div>
              <div className="empty-state-text">デバイスが見つかりません</div>
            </div>
          )
        ) : (
          <SceneList
            scenes={scenes}
            executingScene={executingScene}
            onExecute={handleExecuteScene}
          />
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
