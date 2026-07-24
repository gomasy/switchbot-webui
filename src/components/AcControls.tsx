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
  const ac: AcState = { ...AC_DEFAULT, ...stored };

  const update = (patch: Partial<AcState>) => setStored({ ...ac, ...patch });
  const sendAc = (next: AcState) => {
    setStored(next);
    send(
      "setAll",
      `${next.temp},${next.mode},${next.fan},${next.power ? "on" : "off"}`,
    );
  };
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
          label={t("control.temperature")}
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
