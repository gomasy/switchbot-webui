import { getRemoteProfile } from "../deviceRegistry";
import { t } from "../i18n";
import type { InfraredDevice } from "../types";
import { AcControls } from "./AcControls";
import {
  ActionButton,
  ActionRow,
  ControlSection,
  PowerButtons,
  SegmentControl,
  TextCommandForm,
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
  return (
    <TextCommandForm
      title={t("control.customButtons")}
      placeholder={t("control.enterButtonName")}
      submitLabel={t("control.send")}
      disabled={sending}
      onSubmit={(name) => send(name, "default", "customize")}
    />
  );
}

export function IrControls({ device, send, sending }: Props) {
  const { kind, diy } = getRemoteProfile(device.remoteType);
  // A remote we cannot place still answers turnOn/turnOff. A DIY one does not
  // even promise that much, so it is left with the buttons its owner recorded.
  const unclassified = kind === "unknown" && !diy;

  return (
    <>
      {kind === "airConditioner" && (
        <AcControls device={device} send={send} sending={sending} />
      )}

      {kind === "tv" && (
        <>
          <PowerButtons send={send} sending={sending} />
          <VolumeButtons send={send} sending={sending} />
          <ControlSection title={t("control.channel")}>
            <ActionRow>
              <ActionButton onClick={() => send("channelSub")} disabled={sending}>
                -
              </ActionButton>
              <ActionButton onClick={() => send("channelAdd")} disabled={sending}>
                +
              </ActionButton>
            </ActionRow>
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

      {kind === "fan" && (
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

      {kind === "light" && (
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
          {!diy && (
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

      {kind === "player" && (
        <>
          <PowerButtons send={send} sending={sending} />
          {!diy && (
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
                  <ActionButton onClick={() => send("Stop")} disabled={sending}>
                    {t("control.stop")}
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

      {kind !== "others" && !unclassified && (
        <DiyButtons device={device} send={send} sending={sending} />
      )}

      {kind === "others" && <FreeformButton send={send} sending={sending} />}

      {unclassified && <PowerButtons send={send} sending={sending} />}
    </>
  );
}
