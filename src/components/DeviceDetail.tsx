import { useCallback, useEffect, useState } from "react";
import { getDeviceStatus, sendCommand } from "../api";
import { getDeviceIcon } from "../deviceIcon";
import type { Device, InfraredDevice, DeviceStatus } from "../types";

interface Props {
  device: Device | InfraredDevice;
  isInfrared: boolean;
  onClose: () => void;
  onToast: (msg: string, type: "success" | "error") => void;
}

type ControlKind =
  | "power"
  | "press"
  | "brightness"
  | "color"
  | "colorTemp"
  | "position"
  | "lock"
  | "vacuum"
  | "humidity";

function getControls(deviceType: string): ControlKind[] {
  const t = deviceType.toLowerCase();
  if (
    t.includes("meter") ||
    t.includes("motion") ||
    t.includes("contact") ||
    t.includes("keypad")
  )
    return [];
  if (t.includes("bot")) return ["power", "press"];
  if (t.includes("color bulb") || t.includes("strip"))
    return ["power", "brightness", "color", "colorTemp"];
  if (t.includes("ceiling light"))
    return ["power", "brightness", "colorTemp"];
  if (t.includes("bulb") || t.includes("light") || t.includes("lamp"))
    return ["power", "brightness"];
  if (t.includes("curtain") || t.includes("blind") || t.includes("roller"))
    return ["position"];
  if (t.includes("lock")) return ["lock"];
  if (t.includes("humidifier")) return ["power", "humidity"];
  if (
    t.includes("vacuum") ||
    t.includes("k10") ||
    t.includes("k20") ||
    t.includes("s10") ||
    t.includes("k11")
  )
    return ["vacuum"];
  if (t.includes("plug")) return ["power"];
  if (t.includes("hub")) return [];
  return ["power"];
}

const AC_MODES = [
  { value: 1, label: "自動" },
  { value: 2, label: "冷房" },
  { value: 3, label: "除湿" },
  { value: 4, label: "送風" },
  { value: 5, label: "暖房" },
] as const;

const AC_FAN_SPEEDS = [
  { value: 1, label: "自動" },
  { value: 2, label: "弱" },
  { value: 3, label: "中" },
  { value: 4, label: "強" },
] as const;

function PowerButtons({ send, sending }: { send: (cmd: string) => void; sending: boolean }) {
  return (
    <div className="control-section">
      <div className="action-buttons">
        <button className="action-btn action-btn-primary" onClick={() => send("turnOn")} disabled={sending}>ON</button>
        <button className="action-btn action-btn-secondary" onClick={() => send("turnOff")} disabled={sending}>OFF</button>
      </div>
    </div>
  );
}

function VolumeButtons({ send, sending }: { send: (cmd: string) => void; sending: boolean }) {
  return (
    <div className="control-section">
      <div className="control-section-title">音量</div>
      <div className="action-buttons">
        <button className="action-btn action-btn-secondary" onClick={() => send("volumeSub")} disabled={sending}>-</button>
        <button className="action-btn action-btn-secondary" onClick={() => send("volumeAdd")} disabled={sending}>+</button>
      </div>
    </div>
  );
}

export function DeviceDetail({
  device,
  isInfrared,
  onClose,
  onToast,
}: Props) {
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [loading, setLoading] = useState(!isInfrared);
  const [sending, setSending] = useState(false);

  const [brightness, setBrightness] = useState(100);
  const [colorTemp, setColorTemp] = useState(3500);
  const [position, setPosition] = useState(0);
  const [humidityVal, setHumidityVal] = useState(50);
  const [color, setColor] = useState("#ffffff");

  const acKey = `ac-state-${device.deviceId}`;
  const [savedAc] = useState(() => {
    try {
      const v = localStorage.getItem(acKey);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  });
  const [acTemp, setAcTemp] = useState(savedAc?.temp ?? 26);
  const [acMode, setAcMode] = useState(savedAc?.mode ?? 1);
  const [acFan, setAcFan] = useState(savedAc?.fan ?? 1);
  const [acPower, setAcPower] = useState(savedAc?.power ?? false);
  const [customBtn, setCustomBtn] = useState("");

  const fetchStatus = useCallback(async () => {
    if (isInfrared) return;
    try {
      setLoading(true);
      const res = await getDeviceStatus(device.deviceId);
      if (res.statusCode === 100) {
        const s = res.body;
        setStatus(s);
        if (typeof s.brightness === "number") setBrightness(s.brightness);
        if (typeof s.colorTemperature === "number")
          setColorTemp(s.colorTemperature);
        if (typeof s.slidePosition === "number") setPosition(s.slidePosition);
        if (typeof s.nebulizationEfficiency === "number")
          setHumidityVal(s.nebulizationEfficiency);
        if (s.color) {
          const [r, g, b] = s.color.split(":").map(Number);
          setColor(
            `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`,
          );
        }
      }
    } catch {
      onToast("ステータスの取得に失敗しました", "error");
    } finally {
      setLoading(false);
    }
  }, [device.deviceId, isInfrared, onToast]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const send = async (
    command: string,
    parameter: unknown = "default",
    commandType = "command",
  ) => {
    if (sending) return;
    setSending(true);
    try {
      const res = await sendCommand(
        device.deviceId,
        command,
        parameter,
        commandType,
      );
      if (res.statusCode === 100) {
        onToast(`${device.deviceName}: ${command}`, "success");
        if (!isInfrared) setTimeout(fetchStatus, 1000);
      } else {
        onToast(`エラー: ${res.message}`, "error");
      }
    } catch {
      onToast("コマンドの送信に失敗しました", "error");
    } finally {
      setSending(false);
    }
  };

  const sendAcAll = (
    temp = acTemp,
    mode = acMode,
    fan = acFan,
    power = true,
  ) => {
    const p = power ? "on" : "off";
    setAcPower(power);
    const state = { temp, mode, fan, power };
    try {
      localStorage.setItem(acKey, JSON.stringify(state));
    } catch {}
    send("setAll", `${temp},${mode},${fan},${p}`);
  };

  const typeLabel = isInfrared
    ? (device as InfraredDevice).remoteType
    : (device as Device).deviceType;
  const controls = isInfrared ? [] : getControls((device as Device).deviceType);
  const isOn = status?.power === "on";

  const remoteType = isInfrared
    ? (device as InfraredDevice).remoteType.toLowerCase()
    : "";
  const isAC = remoteType.includes("air conditioner");
  const isTV =
    remoteType.includes("tv") ||
    remoteType.includes("iptv") ||
    remoteType.includes("streamer") ||
    remoteType.includes("set top box");
  const isFan = remoteType.includes("fan");
  const isIRLight = remoteType.includes("light");
  const isDVDSpeaker =
    remoteType.includes("dvd") ||
    remoteType.includes("speaker") ||
    remoteType.includes("projector");
  const isOthers = isInfrared && remoteType === "others";
  const isUnknownIR =
    isInfrared && !isAC && !isTV && !isFan && !isIRLight && !isDVDSpeaker && !isOthers;

  const statusItems: { label: string; value: string }[] = [];
  if (status) {
    if (typeof status.temperature === "number")
      statusItems.push({ label: "温度", value: `${status.temperature}°C` });
    if (typeof status.humidity === "number")
      statusItems.push({ label: "湿度", value: `${status.humidity}%` });
    if (typeof status.battery === "number")
      statusItems.push({ label: "バッテリー", value: `${status.battery}%` });
    if (status.version)
      statusItems.push({ label: "ファームウェア", value: status.version });
    if (typeof status.voltage === "number")
      statusItems.push({ label: "電圧", value: `${status.voltage}V` });
    if (typeof status.electricCurrent === "number")
      statusItems.push({ label: "電流", value: `${status.electricCurrent}A` });
    if (typeof status.electricityOfDay === "number")
      statusItems.push({
        label: "本日の電力",
        value: `${status.electricityOfDay}W`,
      });
    if (status.lockState)
      statusItems.push({
        label: "ロック",
        value: status.lockState === "locked" ? "施錠" : "解錠",
      });
    if (status.doorState)
      statusItems.push({
        label: "ドア",
        value: status.doorState === "closed" ? "閉" : "開",
      });
    if (status.moveDetected !== undefined)
      statusItems.push({
        label: "動体検知",
        value: status.moveDetected ? "検知" : "なし",
      });
    if (status.openState)
      statusItems.push({
        label: "開閉",
        value: status.openState === "close" ? "閉" : "開",
      });
    if (status.workingStatus)
      statusItems.push({ label: "動作状態", value: status.workingStatus });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
          <div className="modal-device-icon">{getDeviceIcon(typeLabel)}</div>
          <div className="modal-device-info">
            <div className="modal-device-name">{device.deviceName}</div>
            <div className="modal-device-type">{typeLabel}</div>
          </div>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="loading">
              <div className="spinner" />
            </div>
          ) : (
            <>
              {statusItems.length > 0 && (
                <div className="status-section">
                  <div className="status-grid">
                    {statusItems.map((item) => (
                      <div key={item.label} className="status-item">
                        <div className="status-value">{item.value}</div>
                        <div className="status-label">{item.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Physical device controls */}
              {controls.includes("power") && (
                <div className="control-section">
                  <div className="power-toggle">
                    <button
                      className={`power-btn ${isOn ? "on" : ""}`}
                      onClick={() => send(isOn ? "turnOff" : "turnOn")}
                      disabled={sending}
                    >
                      ⏻
                    </button>
                    <span className="power-label">{isOn ? "ON" : "OFF"}</span>
                  </div>
                </div>
              )}

              {controls.includes("press") && (
                <div className="control-section">
                  <div className="action-buttons">
                    <button
                      className="action-btn action-btn-primary"
                      onClick={() => send("press")}
                      disabled={sending}
                    >
                      Press
                    </button>
                  </div>
                </div>
              )}

              {controls.includes("brightness") && (
                <div className="control-section">
                  <div className="slider-control">
                    <div className="slider-header">
                      <span className="slider-label">明るさ</span>
                      <span className="slider-value">{brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      onMouseUp={() => send("setBrightness", brightness)}
                      onTouchEnd={() => send("setBrightness", brightness)}
                    />
                  </div>
                </div>
              )}

              {controls.includes("color") && (
                <div className="control-section">
                  <div className="control-row">
                    <span className="control-label">カラー</span>
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      onBlur={() => {
                        const r = parseInt(color.slice(1, 3), 16);
                        const g = parseInt(color.slice(3, 5), 16);
                        const b = parseInt(color.slice(5, 7), 16);
                        send("setColor", `${r}:${g}:${b}`);
                      }}
                    />
                  </div>
                </div>
              )}

              {controls.includes("colorTemp") && (
                <div className="control-section">
                  <div className="slider-control">
                    <div className="slider-header">
                      <span className="slider-label">色温度</span>
                      <span className="slider-value">{colorTemp}K</span>
                    </div>
                    <input
                      type="range"
                      min={2700}
                      max={6500}
                      step={100}
                      value={colorTemp}
                      onChange={(e) => setColorTemp(Number(e.target.value))}
                      onMouseUp={() => send("setColorTemperature", colorTemp)}
                      onTouchEnd={() => send("setColorTemperature", colorTemp)}
                    />
                  </div>
                </div>
              )}

              {controls.includes("position") && (
                <div className="control-section">
                  <div className="control-section-title">カーテン操作</div>
                  <div className="slider-control">
                    <div className="slider-header">
                      <span className="slider-label">位置</span>
                      <span className="slider-value">{position}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={position}
                      onChange={(e) => setPosition(Number(e.target.value))}
                      onMouseUp={() => send("setPosition", `0,ff,${position}`)}
                      onTouchEnd={() =>
                        send("setPosition", `0,ff,${position}`)
                      }
                    />
                  </div>
                  <div className="action-buttons">
                    <button
                      className="action-btn action-btn-primary"
                      onClick={() => send("turnOn")}
                      disabled={sending}
                    >
                      開く
                    </button>
                    <button
                      className="action-btn action-btn-secondary"
                      onClick={() => send("turnOff")}
                      disabled={sending}
                    >
                      閉じる
                    </button>
                  </div>
                </div>
              )}

              {controls.includes("lock") && (
                <div className="control-section">
                  <div className="control-section-title">ロック操作</div>
                  <div className="action-buttons">
                    <button
                      className="action-btn action-btn-primary"
                      onClick={() => send("lock")}
                      disabled={sending}
                    >
                      施錠
                    </button>
                    <button
                      className="action-btn action-btn-secondary"
                      onClick={() => send("unlock")}
                      disabled={sending}
                    >
                      解錠
                    </button>
                  </div>
                </div>
              )}

              {controls.includes("vacuum") && (
                <div className="control-section">
                  <div className="control-section-title">ロボット掃除機</div>
                  <div className="action-buttons">
                    <button
                      className="action-btn action-btn-primary"
                      onClick={() => send("start")}
                      disabled={sending}
                    >
                      開始
                    </button>
                    <button
                      className="action-btn action-btn-secondary"
                      onClick={() => send("stop")}
                      disabled={sending}
                    >
                      停止
                    </button>
                  </div>
                  <div className="action-buttons" style={{ marginTop: 8 }}>
                    <button
                      className="action-btn action-btn-secondary"
                      onClick={() => send("dock")}
                      disabled={sending}
                    >
                      充電に戻る
                    </button>
                  </div>
                </div>
              )}

              {controls.includes("humidity") && (
                <div className="control-section">
                  <div className="slider-control">
                    <div className="slider-header">
                      <span className="slider-label">加湿量</span>
                      <span className="slider-value">{humidityVal}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={humidityVal}
                      onChange={(e) => setHumidityVal(Number(e.target.value))}
                      onMouseUp={() => send("setMode", `${humidityVal}`)}
                      onTouchEnd={() => send("setMode", `${humidityVal}`)}
                    />
                  </div>
                </div>
              )}

              {/* IR: Air Conditioner */}
              {isInfrared && isAC && (
                <>
                  <div className="control-section">
                    <div className="power-toggle">
                      <button
                        className={`power-btn ${acPower ? "on" : ""}`}
                        onClick={() => sendAcAll(acTemp, acMode, acFan, !acPower)}
                        disabled={sending}
                      >
                        ⏻
                      </button>
                      <span className="power-label">
                        {acPower ? "ON" : "OFF"}
                      </span>
                    </div>
                  </div>
                  <div className="control-section">
                    <div className="slider-control">
                      <div className="slider-header">
                        <span className="slider-label">温度</span>
                        <span className="slider-value">{acTemp}°C</span>
                      </div>
                      <input
                        type="range"
                        min={16}
                        max={30}
                        value={acTemp}
                        onChange={(e) => setAcTemp(Number(e.target.value))}
                        onMouseUp={() => {
                          if (acPower) sendAcAll(acTemp, acMode, acFan, true);
                        }}
                        onTouchEnd={() => {
                          if (acPower) sendAcAll(acTemp, acMode, acFan, true);
                        }}
                      />
                    </div>
                  </div>
                  <div className="control-section">
                    <div className="control-section-title">モード</div>
                    <div className="segment-control">
                      {AC_MODES.map((m) => (
                        <button
                          key={m.value}
                          className={`segment-btn ${acMode === m.value ? "active" : ""}`}
                          onClick={() => {
                            setAcMode(m.value);
                            if (acPower) sendAcAll(acTemp, m.value, acFan, true);
                          }}
                          disabled={sending}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="control-section">
                    <div className="control-section-title">風量</div>
                    <div className="segment-control">
                      {AC_FAN_SPEEDS.map((f) => (
                        <button
                          key={f.value}
                          className={`segment-btn ${acFan === f.value ? "active" : ""}`}
                          onClick={() => {
                            setAcFan(f.value);
                            if (acPower)
                              sendAcAll(acTemp, acMode, f.value, true);
                          }}
                          disabled={sending}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* IR: TV / Streamer / STB */}
              {isInfrared && isTV && (
                <>
                  <PowerButtons send={send} sending={sending} />
                  <VolumeButtons send={send} sending={sending} />
                  <div className="control-section">
                    <div className="control-section-title">チャンネル</div>
                    <div className="action-buttons">
                      <button
                        className="action-btn action-btn-secondary"
                        onClick={() => send("channelSub")}
                        disabled={sending}
                      >
                        -
                      </button>
                      <button
                        className="action-btn action-btn-secondary"
                        onClick={() => send("channelAdd")}
                        disabled={sending}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* IR: Fan */}
              {isInfrared && isFan && (
                <>
                  <PowerButtons send={send} sending={sending} />
                  <div className="control-section">
                    <div className="control-section-title">風量</div>
                    <div className="segment-control">
                      <button
                        className="segment-btn"
                        onClick={() => send("lowSpeed")}
                        disabled={sending}
                      >
                        弱
                      </button>
                      <button
                        className="segment-btn"
                        onClick={() => send("middleSpeed")}
                        disabled={sending}
                      >
                        中
                      </button>
                      <button
                        className="segment-btn"
                        onClick={() => send("highSpeed")}
                        disabled={sending}
                      >
                        強
                      </button>
                    </div>
                  </div>
                  <div className="control-section">
                    <div className="action-buttons">
                      <button
                        className="action-btn action-btn-secondary"
                        onClick={() => send("swing")}
                        disabled={sending}
                      >
                        首振り
                      </button>
                      <button
                        className="action-btn action-btn-secondary"
                        onClick={() => send("timer")}
                        disabled={sending}
                      >
                        タイマー
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* IR: Light */}
              {isInfrared && isIRLight && (
                <>
                  <PowerButtons send={send} sending={sending} />
                  <div className="control-section">
                    <div className="control-section-title">明るさ</div>
                    <div className="action-buttons">
                      <button
                        className="action-btn action-btn-secondary"
                        onClick={() => send("brightnessDown")}
                        disabled={sending}
                      >
                        -
                      </button>
                      <button
                        className="action-btn action-btn-secondary"
                        onClick={() => send("brightnessUp")}
                        disabled={sending}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="control-section">
                    <div className="action-buttons">
                      <button
                        className="action-btn action-btn-secondary"
                        onClick={() => send("colorTemperature")}
                        disabled={sending}
                      >
                        色温度切替
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* IR: DVD / Speaker / Projector */}
              {isInfrared && isDVDSpeaker && (
                <>
                  <PowerButtons send={send} sending={sending} />
                  <div className="control-section">
                    <div className="control-section-title">音量</div>
                    <div className="action-buttons">
                      <button className="action-btn action-btn-secondary" onClick={() => send("volumeSub")} disabled={sending}>-</button>
                      <button className="action-btn action-btn-secondary" onClick={() => send("setMute")} disabled={sending}>ミュート</button>
                      <button className="action-btn action-btn-secondary" onClick={() => send("volumeAdd")} disabled={sending}>+</button>
                    </div>
                  </div>
                  <div className="control-section">
                    <div className="control-section-title">再生</div>
                    <div className="action-buttons">
                      <button
                        className="action-btn action-btn-secondary"
                        onClick={() => send("Rewind")}
                        disabled={sending}
                      >
                        ◀◀
                      </button>
                      <button
                        className="action-btn action-btn-primary"
                        onClick={() => send("Play")}
                        disabled={sending}
                      >
                        ▶
                      </button>
                      <button
                        className="action-btn action-btn-secondary"
                        onClick={() => send("FastForward")}
                        disabled={sending}
                      >
                        ▶▶
                      </button>
                    </div>
                    <div className="action-buttons" style={{ marginTop: 8 }}>
                      <button
                        className="action-btn action-btn-secondary"
                        onClick={() => send("Previous")}
                        disabled={sending}
                      >
                        前へ
                      </button>
                      <button
                        className="action-btn action-btn-secondary"
                        onClick={() => send("Pause")}
                        disabled={sending}
                      >
                        一時停止
                      </button>
                      <button
                        className="action-btn action-btn-secondary"
                        onClick={() => send("Next")}
                        disabled={sending}
                      >
                        次へ
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* IR: Others (custom buttons only) */}
              {isOthers && (
                <div className="control-section">
                  <div className="control-section-title">
                    カスタムボタン
                  </div>
                  <form
                    className="custom-btn-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = customBtn.trim();
                      if (name) send(name, "default", "customize");
                    }}
                  >
                    <input
                      type="text"
                      className="custom-btn-input"
                      placeholder="ボタン名を入力"
                      value={customBtn}
                      onChange={(e) => setCustomBtn(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="action-btn action-btn-primary"
                      disabled={sending || !customBtn.trim()}
                    >
                      送信
                    </button>
                  </form>
                </div>
              )}

              {/* IR: Unknown type fallback */}
              {isUnknownIR && <PowerButtons send={send} sending={sending} />}

              {controls.length === 0 &&
                !isInfrared &&
                statusItems.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-state-icon">📊</div>
                    <div className="empty-state-text">
                      このデバイスの詳細情報はありません
                    </div>
                  </div>
                )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
