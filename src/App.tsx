import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getConfig,
  getDevices,
  getScenes,
  executeScene,
  logout,
  UnauthorizedError,
  setUnauthorizedHandler,
} from "./api";
import { useToasts } from "./hooks";
import { useRealtime } from "./realtime";
import { t, tFmt } from "./i18n";
import { groupRooms, type RoomDevice } from "./rooms";
import { readStorage, writeStorage } from "./storage";
import type { Device, DeviceStatus, InfraredDevice, Scene } from "./types";
import { Header } from "./components/Header";
import { DeviceCard } from "./components/DeviceCard";
import { DeviceDetail } from "./components/DeviceDetail";
import { LoginScreen } from "./components/LoginScreen";
import { SceneList } from "./components/SceneList";

type Tab = "home" | "scenes";

function getInitialTheme(): boolean {
  const saved = readStorage("theme");
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
  const [deviceRefresh, setDeviceRefresh] = useState<Record<string, number>>({});
  const [needsLogin, setNeedsLogin] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [realtime, setRealtime] = useState(false);
  const { toasts, addToast } = useToasts();

  useEffect(() => {
    const theme = darkMode ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    writeStorage("theme", theme);
  }, [darkMode]);

  // Any request rejected with our auth 401 flips the app to the login screen.
  useEffect(() => {
    setUnauthorizedHandler(() => setNeedsLogin(true));
    return () => setUnauthorizedHandler(null);
  }, []);

  // Learn whether login is required and whether realtime updates are available.
  useEffect(() => {
    getConfig()
      .then((cfg) => {
        setAuthEnabled(cfg.authEnabled);
        setRealtime(cfg.realtime);
      })
      .catch(() => {});
  }, []);

  // Merge realtime device updates into the shared status map; DeviceCard picks
  // them up via externalStatus. Paused while the login screen is shown.
  useRealtime(
    realtime && !needsLogin,
    (update) => {
      setDeviceStatuses((prev) => ({
        ...prev,
        // Keep only the latest partial event. DeviceCard merges it into its
        // fetched state, without reviving stale fields from earlier events.
        [update.deviceId]: update as DeviceStatus,
      }));
    },
    () => {
      setDeviceStatuses({});
      setRefreshSignal((n) => n + 1);
    },
  );

  const handleLogout = async () => {
    try {
      await logout();
      setNeedsLogin(true);
    } catch {
      addToast(t("app.logoutFailed"), "error");
    }
  };

  const rooms = useMemo(() => groupRooms(devices, irDevices), [devices, irDevices]);

  const lastFetch = useRef(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    lastFetch.current = Date.now();
    setRefreshSignal((n) => n + 1);
    // Settled, not all: a failing scene list must not blank out the devices.
    const [devicesResult, scenesResult] = await Promise.allSettled([
      getDevices(),
      getScenes(),
    ]);

    if (devicesResult.status === "rejected") {
      // Unauthorized is handled globally via setUnauthorizedHandler.
      const e = devicesResult.reason;
      if (!(e instanceof UnauthorizedError)) {
        setError(e instanceof Error ? e.message : t("app.connectionFailed"));
      }
    } else if (devicesResult.value.statusCode === 100) {
      setDevices(devicesResult.value.body.deviceList || []);
      setIrDevices(devicesResult.value.body.infraredRemoteList || []);
    } else {
      setError(devicesResult.value.message || t("app.fetchDevicesFailed"));
    }

    if (
      scenesResult.status === "fulfilled" &&
      scenesResult.value.statusCode === 100
    ) {
      setScenes(scenesResult.value.body || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
        addToast(t("app.sceneExecuted"), "success");
      } else {
        addToast(tFmt("common.error", { message: res.message }), "error");
      }
    } catch (e) {
      // Unauthorized is handled globally via setUnauthorizedHandler.
      if (!(e instanceof UnauthorizedError)) {
        addToast(t("app.executeSceneFailed"), "error");
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

  const renderContent = () => {
    if (error) {
      return (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={fetchData}>{t("app.retry")}</button>
        </div>
      );
    }
    if (loading && devices.length === 0) {
      return (
        <div className="loading">
          <div className="spinner" />
          <span>{t("app.loadingDevices")}</span>
        </div>
      );
    }
    if (tab !== "home") {
      return (
        <SceneList
          scenes={scenes}
          executingScene={executingScene}
          onExecute={handleExecuteScene}
        />
      );
    }
    if (rooms.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-state-icon">📱</div>
          <div className="empty-state-text">{t("app.noDevices")}</div>
        </div>
      );
    }
    return rooms.map((room) => (
      <div key={room.id} className="room-section">
        <div className="section-title">{room.name}</div>
        <div className="device-grid">
          {room.devices.map(({ device, isInfrared }) => (
            <DeviceCard
              key={device.deviceId}
              device={device}
              isInfrared={isInfrared}
              externalStatus={deviceStatuses[device.deviceId]}
              // A card re-fetches when the global signal or its own counter
              // changes; both only increase, so their sum is a valid signal.
              refreshSignal={refreshSignal + (deviceRefresh[device.deviceId] ?? 0)}
              onClick={() => setSelectedDevice({ device, isInfrared })}
              onToast={addToast}
            />
          ))}
        </div>
      </div>
    ));
  };

  return (
    <>
      <Header
        loading={loading}
        onRefresh={fetchData}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((v) => !v)}
        onLogout={authEnabled ? handleLogout : undefined}
      />

      <main className="main">{renderContent()}</main>

      <nav className="bottom-nav">
        <button
          className={`nav-item ${tab === "home" ? "active" : ""}`}
          onClick={() => setTab("home")}
        >
          <span className="nav-icon">🏠</span>
          {t("nav.home")}
        </button>
        <button
          className={`nav-item ${tab === "scenes" ? "active" : ""}`}
          onClick={() => setTab("scenes")}
        >
          <span className="nav-icon">⚡</span>
          {t("nav.scenes")}
        </button>
      </nav>

      {selectedDevice && (
        <DeviceDetail
          device={selectedDevice.device}
          isInfrared={selectedDevice.isInfrared}
          onClose={() => {
            const deviceId = selectedDevice.device.deviceId;
            setDeviceStatuses((prev) => {
              const next = { ...prev };
              delete next[deviceId];
              return next;
            });
            // Only the device that was open can have changed. Refreshing every
            // card here would burn the SwitchBot daily request quota.
            if (!selectedDevice.isInfrared) {
              setDeviceRefresh((prev) => ({
                ...prev,
                [deviceId]: (prev[deviceId] ?? 0) + 1,
              }));
            }
            setSelectedDevice(null);
          }}
          onToast={addToast}
        />
      )}

      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </>
  );
}
