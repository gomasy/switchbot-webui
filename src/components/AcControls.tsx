import { useState } from "react";
import { useStoredState } from "../hooks";
import { t } from "../i18n";
import type { InfraredDevice } from "../types";
import {
  ControlSection,
  PowerToggle,
  SegmentControl,
  Slider,
  type SendFn,
} from "./controls";

const acModes = () =>
  [
    { value: 1, label: t("ac.auto") },
    { value: 2, label: t("ac.cool") },
    { value: 3, label: t("ac.dry") },
    { value: 4, label: t("ac.fan") },
    { value: 5, label: t("ac.heat") },
  ] as const;

const acFanSpeeds = () =>
  [
    { value: 1, label: t("fan.auto") },
    { value: 2, label: t("fan.low") },
    { value: 3, label: t("fan.medium") },
    { value: 4, label: t("fan.high") },
  ] as const;

interface AcState {
  temp: number;
  mode: number;
  fan: number;
  power: boolean;
}

const AC_DEFAULT: AcState = { temp: 26, mode: 1, fan: 1, power: false };

interface Props {
  device: InfraredDevice;
  send: SendFn;
  sending: boolean;
}

export function AcControls({ device, send, sending }: Props) {
  const [stored, setStored] = useStoredState<Partial<AcState>>(
    `ac-state-${device.deviceId}`,
    {},
  );
  // While the slider is being dragged its value is a draft: it is only stored
  // once the command succeeds, so a failed send reverts to the known state.
  const [tempDraft, setTempDraft] = useState<number | null>(null);
  const saved: AcState = { ...AC_DEFAULT, ...stored };
  const ac: AcState = tempDraft === null ? saved : { ...saved, temp: tempDraft };

  const commit = (next: AcState) => {
    setStored(next);
    setTempDraft(null);
  };
  const sendAc = async (next: AcState) => {
    const ok = await send(
      "setAll",
      `${next.temp},${next.mode},${next.fan},${next.power ? "on" : "off"}`,
    );
    if (ok) setStored(next);
    setTempDraft(null);
  };
  const updateAndSendIfOn = (patch: Partial<AcState>) => {
    const next = { ...ac, ...patch };
    if (ac.power) sendAc(next);
    else commit(next);
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
          label={t("control.temperature")}
          valueLabel={`${ac.temp}°C`}
          min={16}
          max={30}
          value={ac.temp}
          disabled={sending}
          onChange={setTempDraft}
          onCommit={() => {
            if (ac.power) sendAc(ac);
            else commit(ac);
          }}
        />
      </ControlSection>
      <ControlSection title={t("control.mode")}>
        <SegmentControl
          options={acModes()}
          value={ac.mode}
          onSelect={(mode) => updateAndSendIfOn({ mode })}
          disabled={sending}
        />
      </ControlSection>
      <ControlSection title={t("control.fanSpeed")}>
        <SegmentControl
          options={acFanSpeeds()}
          value={ac.fan}
          onSelect={(fan) => updateAndSendIfOn({ fan })}
          disabled={sending}
        />
      </ControlSection>
    </>
  );
}
