import { useState } from "react";
import { useStoredState } from "../hooks";
import type { InfraredDevice } from "../types";
import {
  ActionButton,
  ActionRow,
  ControlSection,
  PowerButtons,
  PowerToggle,
  SegmentControl,
  Slider,
  type SendFn,
} from "./controls";

interface Props {
  device: InfraredDevice;
  send: SendFn;
  sending: boolean;
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

const IR_FAN_SPEEDS = [
  { value: "lowSpeed", label: "弱" },
  { value: "middleSpeed", label: "中" },
  { value: "highSpeed", label: "強" },
] as const;

const TV_CHANNELS = Array.from({ length: 12 }, (_, i) => i + 1);

interface AcState {
  temp: number;
  mode: number;
  fan: number;
  power: boolean;
}

const AC_DEFAULT: AcState = { temp: 26, mode: 1, fan: 1, power: false };

function AcControls({ device, send, sending }: Props) {
  const [stored, setStored] = useStoredState<Partial<AcState>>(
    `ac-state-${device.deviceId}`,
    {},
  );
  const ac: AcState = { ...AC_DEFAULT, ...stored };

  const update = (patch: Partial<AcState>) => setStored({ ...ac, ...patch });
  const sendAc = (next: AcState) => {
    setStored(next);
    send(
      "setAll",
      `${next.temp},${next.mode},${next.fan},${next.power ? "on" : "off"}`,
    );
  };
  // 電源 OFF のままモードなどを変えた場合は保存のみ行い、次回 ON 時に反映する
  const updateAndSendIfOn = (patch: Partial<AcState>) => {
    const next = { ...ac, ...patch };
    if (ac.power) sendAc(next);
    else setStored(next);
  };

  return (
    <>
      <PowerToggle
        on={ac.power}
        onToggle={() => sendAc({ ...ac, power: !ac.power })}
        disabled={sending}
      />
      <ControlSection>
        <Slider
          label="温度"
          valueLabel={`${ac.temp}°C`}
          min={16}
          max={30}
          value={ac.temp}
          onChange={(temp) => update({ temp })}
          onCommit={() => {
            if (ac.power) sendAc(ac);
          }}
        />
      </ControlSection>
      <ControlSection title="モード">
        <SegmentControl
          options={AC_MODES}
          value={ac.mode}
          onSelect={(mode) => updateAndSendIfOn({ mode })}
          disabled={sending}
        />
      </ControlSection>
      <ControlSection title="風量">
        <SegmentControl
          options={AC_FAN_SPEEDS}
          value={ac.fan}
          onSelect={(fan) => updateAndSendIfOn({ fan })}
          disabled={sending}
        />
      </ControlSection>
    </>
  );
}

function VolumeButtons({ send, sending }: { send: SendFn; sending: boolean }) {
  return (
    <ControlSection title="音量">
      <ActionRow>
        <ActionButton onClick={() => send("volumeSub")} disabled={sending}>
          -
        </ActionButton>
        <ActionButton onClick={() => send("setMute")} disabled={sending}>
          ミュート
        </ActionButton>
        <ActionButton onClick={() => send("volumeAdd")} disabled={sending}>
          +
        </ActionButton>
      </ActionRow>
    </ControlSection>
  );
}

interface DiyButton {
  id: string;
  label: string;
}

function DiyButtons({ device, send, sending }: Props) {
  const [buttons, setButtons] = useStoredState<DiyButton[]>(
    `custom-buttons-${device.deviceId}`,
    [],
  );
  const [editing, setEditing] = useState(false);
  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");

  return (
    <div className="control-section">
      <div className="control-section-header">
        <div className="control-section-title" style={{ marginBottom: 0 }}>
          カスタムボタン
        </div>
        <button className="edit-toggle-btn" onClick={() => setEditing((v) => !v)}>
          {editing ? "完了" : "編集"}
        </button>
      </div>
      {buttons.length > 0 && (
        <div className="diy-button-grid">
          {buttons.map((btn) => (
            <div key={btn.id} className="diy-button-wrapper">
              <ActionButton
                onClick={() => send(btn.id, "default", "customize")}
                disabled={sending || editing}
              >
                {btn.label}
              </ActionButton>
              {editing && (
                <button
                  className="diy-remove-btn"
                  onClick={() =>
                    setButtons(buttons.filter((b) => b.id !== btn.id))
                  }
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && (
        <form
          className="diy-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            const id = newId.trim();
            const label = newLabel.trim();
            if (id && label && !buttons.some((b) => b.id === id)) {
              setButtons([...buttons, { id, label }]);
              setNewId("");
              setNewLabel("");
            }
          }}
        >
          <div className="diy-add-row">
            <input
              type="text"
              className="custom-btn-input"
              placeholder="番号"
              inputMode="numeric"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              style={{ flex: 1 }}
            />
            <input
              type="text"
              className="custom-btn-input"
              placeholder="表示名"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              style={{ flex: 2 }}
            />
          </div>
          <button
            type="submit"
            className="action-btn action-btn-primary"
            disabled={!newId.trim() || !newLabel.trim()}
          >
            追加
          </button>
        </form>
      )}
      {buttons.length === 0 && !editing && (
        <div className="diy-empty">「編集」からボタンを登録してください</div>
      )}
    </div>
  );
}

function FreeformButton({ send, sending }: { send: SendFn; sending: boolean }) {
  const [name, setName] = useState("");
  return (
    <ControlSection title="カスタムボタン">
      <form
        className="custom-btn-form"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (trimmed) send(trimmed, "default", "customize");
        }}
      >
        <input
          type="text"
          className="custom-btn-input"
          placeholder="ボタン名を入力"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          className="action-btn action-btn-primary"
          disabled={sending || !name.trim()}
        >
          送信
        </button>
      </form>
    </ControlSection>
  );
}

export function IrControls({ device, send, sending }: Props) {
  const remoteType = device.remoteType.toLowerCase();
  const isAC = remoteType.includes("air conditioner");
  const isTV =
    remoteType.includes("tv") ||
    remoteType.includes("iptv") ||
    remoteType.includes("streamer") ||
    remoteType.includes("set top box");
  const isFan = remoteType.includes("fan");
  const isLight = remoteType.includes("light");
  const isDVDSpeaker =
    remoteType.includes("dvd") ||
    remoteType.includes("speaker") ||
    remoteType.includes("projector");
  const isDIY = remoteType.startsWith("diy");
  const isOthers = remoteType === "others";
  const isUnknown =
    !isAC && !isTV && !isFan && !isLight && !isDVDSpeaker && !isDIY && !isOthers;

  return (
    <>
      {isAC && <AcControls device={device} send={send} sending={sending} />}

      {isTV && (
        <>
          <PowerButtons send={send} sending={sending} />
          <VolumeButtons send={send} sending={sending} />
          <ControlSection title="チャンネル">
            <div className="channel-grid">
              {TV_CHANNELS.map((ch) => (
                <button
                  key={ch}
                  className="channel-btn"
                  onClick={() => send("SetChannel", ch)}
                  disabled={sending}
                >
                  {ch}
                </button>
              ))}
            </div>
          </ControlSection>
        </>
      )}

      {isFan && (
        <>
          <PowerButtons send={send} sending={sending} />
          <ControlSection title="風量">
            <SegmentControl
              options={IR_FAN_SPEEDS}
              onSelect={(cmd) => send(cmd)}
              disabled={sending}
            />
          </ControlSection>
          <ControlSection>
            <ActionRow>
              <ActionButton onClick={() => send("swing")} disabled={sending}>
                首振り
              </ActionButton>
              <ActionButton onClick={() => send("timer")} disabled={sending}>
                タイマー
              </ActionButton>
            </ActionRow>
          </ControlSection>
        </>
      )}

      {isLight && (
        <>
          <PowerButtons send={send} sending={sending} />
          <ControlSection title="明るさ">
            <ActionRow>
              <ActionButton
                onClick={() => send("brightnessDown")}
                disabled={sending}
              >
                -
              </ActionButton>
              <ActionButton
                onClick={() => send("brightnessUp")}
                disabled={sending}
              >
                +
              </ActionButton>
            </ActionRow>
          </ControlSection>
          {!isDIY && (
            <ControlSection>
              <ActionRow>
                <ActionButton
                  onClick={() => send("colorTemperature")}
                  disabled={sending}
                >
                  色温度切替
                </ActionButton>
              </ActionRow>
            </ControlSection>
          )}
        </>
      )}

      {isDVDSpeaker && (
        <>
          <PowerButtons send={send} sending={sending} />
          {!isDIY && (
            <>
              <VolumeButtons send={send} sending={sending} />
              <ControlSection title="再生">
                <ActionRow>
                  <ActionButton onClick={() => send("Rewind")} disabled={sending}>
                    ◀◀
                  </ActionButton>
                  <ActionButton primary onClick={() => send("Play")} disabled={sending}>
                    ▶
                  </ActionButton>
                  <ActionButton
                    onClick={() => send("FastForward")}
                    disabled={sending}
                  >
                    ▶▶
                  </ActionButton>
                </ActionRow>
                <ActionRow style={{ marginTop: 8 }}>
                  <ActionButton onClick={() => send("Previous")} disabled={sending}>
                    前へ
                  </ActionButton>
                  <ActionButton onClick={() => send("Pause")} disabled={sending}>
                    一時停止
                  </ActionButton>
                  <ActionButton onClick={() => send("Next")} disabled={sending}>
                    次へ
                  </ActionButton>
                </ActionRow>
              </ControlSection>
            </>
          )}
        </>
      )}

      {!isOthers && !isUnknown && (
        <DiyButtons device={device} send={send} sending={sending} />
      )}

      {isOthers && <FreeformButton send={send} sending={sending} />}

      {isUnknown && <PowerButtons send={send} sending={sending} />}
    </>
  );
}
