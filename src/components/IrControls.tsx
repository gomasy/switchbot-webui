import { useState } from "react";
import { t } from "../i18n";
import type { InfraredDevice } from "../types";
import { AcControls } from "./AcControls";
import {
  ActionButton,
  ActionRow,
  ControlSection,
  PowerButtons,
  SegmentControl,
  type SendFn,
} from "./controls";
import { DiyButtons } from "./DiyButtons";

interface Props {
  device: InfraredDevice;
  send: SendFn;
  sending: boolean;
}

const irFanSpeeds = () =>
  [
    { value: "lowSpeed", label: t("fan.low") },
    { value: "middleSpeed", label: t("fan.medium") },
    { value: "highSpeed", label: t("fan.high") },
  ] as const;

const TV_CHANNELS = Array.from({ length: 12 }, (_, i) => i + 1);

function VolumeButtons({ send, sending }: { send: SendFn; sending: boolean }) {
  return (
    <ControlSection title={t("control.volume")}>
      <ActionRow>
        <ActionButton onClick={() => send("volumeSub")} disabled={sending}>
          -
        </ActionButton>
        <ActionButton onClick={() => send("setMute")} disabled={sending}>
          {t("control.mute")}
        </ActionButton>
        <ActionButton onClick={() => send("volumeAdd")} disabled={sending}>
          +
        </ActionButton>
      </ActionRow>
    </ControlSection>
  );
}

function FreeformButton({ send, sending }: { send: SendFn; sending: boolean }) {
  const [name, setName] = useState("");
  return (
    <ControlSection title={t("control.customButtons")}>
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
          placeholder={t("control.enterButtonName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          className="action-btn action-btn-primary"
          disabled={sending || !name.trim()}
        >
          {t("control.send")}
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
          <ControlSection title={t("control.channel")}>
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
          <ControlSection title={t("control.fanSpeed")}>
            <SegmentControl
              options={irFanSpeeds()}
              onSelect={(cmd) => send(cmd)}
              disabled={sending}
            />
          </ControlSection>
          <ControlSection>
            <ActionRow>
              <ActionButton onClick={() => send("swing")} disabled={sending}>
                {t("control.swing")}
              </ActionButton>
              <ActionButton onClick={() => send("timer")} disabled={sending}>
                {t("control.timer")}
              </ActionButton>
            </ActionRow>
          </ControlSection>
        </>
      )}

      {isLight && (
        <>
          <PowerButtons send={send} sending={sending} />
          <ControlSection title={t("control.brightness")}>
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
                  {t("control.colorTempToggle")}
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
              <ControlSection title={t("control.playback")}>
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
                    {t("control.prev")}
                  </ActionButton>
                  <ActionButton onClick={() => send("Pause")} disabled={sending}>
                    {t("control.pause")}
                  </ActionButton>
                  <ActionButton onClick={() => send("Next")} disabled={sending}>
                    {t("control.next")}
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
