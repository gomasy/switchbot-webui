import { useState } from "react";
import { getVacuumProfile } from "../deviceRegistry";
import { t } from "../i18n";
import {
  ActionButton,
  ActionRow,
  ControlSection,
  SegmentControl,
  Slider,
  type SendFn,
} from "./controls";

interface Props {
  deviceType: string;
  send: SendFn;
  sending: boolean;
}

/** Suction levels, which the newer models number from one and the older from zero. */
const suctionLevels = (lowest: number) =>
  ["vacuum.quiet", "vacuum.standard", "vacuum.strong", "vacuum.max"].map(
    (key, i) => ({ value: lowest + i, label: t(key) }),
  );

const waterLevels = () =>
  [
    { value: 1, label: t("vacuum.low") },
    { value: 2, label: t("vacuum.high") },
  ] as const;

export function VacuumControls({ deviceType, send, sending }: Props) {
  const profile = getVacuumProfile(deviceType);
  const [mode, setMode] = useState(profile.modes[0] ?? "");
  const [fanLevel, setFanLevel] = useState(1);
  const [waterLevel, setWaterLevel] = useState(1);
  const [volume, setVolume] = useState(50);

  const start = () => {
    if (!profile.advanced) return send(profile.start);
    const param: Record<string, number> = { fanLevel, times: 1 };
    if (profile.mopping) param.waterLevel = waterLevel;
    return send(profile.start, { action: mode, param });
  };

  return (
    <>
      <ControlSection title={t("control.vacuum")}>
        <ActionRow>
          <ActionButton primary onClick={start} disabled={sending}>
            {t("control.start")}
          </ActionButton>
          <ActionButton onClick={() => send(profile.stop)} disabled={sending}>
            {t("control.stop")}
          </ActionButton>
        </ActionRow>
        <ActionRow style={{ marginTop: 8 }}>
          <ActionButton onClick={() => send("dock")} disabled={sending}>
            {t("control.dock")}
          </ActionButton>
        </ActionRow>
      </ControlSection>

      {profile.modes.length > 0 && (
        <ControlSection title={t("control.mode")}>
          <SegmentControl
            options={profile.modes.map((m) => ({ value: m, label: t(`vacuum.${m}`) }))}
            value={mode}
            onSelect={setMode}
            disabled={sending}
          />
        </ControlSection>
      )}

      <ControlSection title={t("control.suction")}>
        <SegmentControl
          options={suctionLevels(profile.advanced ? 1 : 0)}
          value={profile.advanced ? fanLevel : undefined}
          onSelect={(level) => {
            // The older models apply suction immediately; on the newer ones it
            // is a parameter of the next startClean.
            if (profile.advanced) setFanLevel(level);
            else send("PowLevel", `${level}`);
          }}
          disabled={sending}
        />
      </ControlSection>

      {profile.mopping && (
        <ControlSection title={t("control.mopMoisture")}>
          <SegmentControl
            options={waterLevels()}
            value={waterLevel}
            onSelect={setWaterLevel}
            disabled={sending}
          />
        </ControlSection>
      )}

      {profile.selfClean && (
        <ControlSection title={t("control.selfClean")}>
          <ActionRow>
            <ActionButton onClick={() => send("selfClean", 1)} disabled={sending}>
              {t("control.washMop")}
            </ActionButton>
            <ActionButton onClick={() => send("selfClean", 2)} disabled={sending}>
              {t("control.dryMop")}
            </ActionButton>
            <ActionButton onClick={() => send("selfClean", 3)} disabled={sending}>
              {t("control.stop")}
            </ActionButton>
          </ActionRow>
        </ControlSection>
      )}

      {profile.advanced && (
        <ControlSection>
          <Slider
            label={t("control.volume")}
            valueLabel={`${volume}%`}
            min={0}
            max={100}
            value={volume}
            disabled={sending}
            onChange={setVolume}
            onCommit={() => send("setVolume", volume)}
          />
        </ControlSection>
      )}
    </>
  );
}
