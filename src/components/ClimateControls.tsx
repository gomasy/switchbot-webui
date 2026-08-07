import { useEffect, useState } from "react";
import { getFanProfile } from "../deviceRegistry";
import { t } from "../i18n";
import type { DeviceStatus } from "../types";
import {
  ControlSection,
  SegmentControl,
  Slider,
  ToggleRow,
  type PanelProps,
} from "./controls";

/** The mode integer the API reports, or undefined when it reports a string. */
function numericMode(status: DeviceStatus | null): number | undefined {
  return typeof status?.mode === "number" ? status.mode : undefined;
}

function childLockOf(status: DeviceStatus | null): boolean | undefined {
  const lock = status?.childLock;
  if (typeof lock === "boolean") return lock;
  if (typeof lock === "number") return lock === 1;
  return undefined;
}

const purifierModes = () =>
  [
    { value: 1, label: t("purifier.normal") },
    { value: 2, label: t("purifier.auto") },
    { value: 3, label: t("purifier.sleep") },
    { value: 4, label: t("purifier.pet") },
  ] as const;

const purifierFanGears = () =>
  [
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 3, label: "3" },
  ] as const;

/** Air Purifier: mode, and a fan level the API only accepts in normal mode. */
export function PurifierControls({ status, send, sending }: PanelProps) {
  const [fanGear, setFanGear] = useState(1);
  const mode = numericMode(status);

  // fanGear is rejected outside normal mode, so only send it there.
  const sendMode = (next: number, gear = fanGear) =>
    send("setMode", next === 1 ? { mode: 1, fanGear: gear } : { mode: next });

  return (
    <>
      <ControlSection title={t("control.mode")}>
        <SegmentControl
          options={purifierModes()}
          value={mode}
          onSelect={sendMode}
          disabled={sending}
        />
      </ControlSection>
      {mode === 1 && (
        <ControlSection title={t("control.fanSpeed")}>
          <SegmentControl
            options={purifierFanGears()}
            value={fanGear}
            onSelect={(gear) => {
              setFanGear(gear);
              sendMode(1, gear);
            }}
            disabled={sending}
          />
        </ControlSection>
      )}
      <ToggleRow
        title={t("control.childLock")}
        on={childLockOf(status)}
        onSelect={(on) => send("setChildLock", on ? 1 : 0)}
        disabled={sending}
      />
    </>
  );
}

/**
 * Evaporative Humidifier ("Humidifier2"): a mode enum that mixes fixed output
 * levels with automatic modes, plus a target only the humidity mode uses.
 */
const HUMIDITY_MODE = 5;

const humidifierModes = () =>
  [
    { value: 4, label: t("humid.level1") },
    { value: 3, label: t("humid.level2") },
    { value: 2, label: t("humid.level3") },
    { value: 1, label: t("humid.level4") },
    { value: HUMIDITY_MODE, label: t("humid.target") },
    { value: 6, label: t("humid.sleep") },
    { value: 7, label: t("humid.auto") },
    { value: 8, label: t("humid.drying") },
  ] as const;

export function Humidifier2Controls({ status, send, sending }: PanelProps) {
  const [target, setTarget] = useState(50);
  const mode = numericMode(status);

  const sendMode = (next: number) =>
    send("setMode", { mode: next, targetHumidify: target });

  return (
    <>
      <ControlSection title={t("control.mode")}>
        <SegmentControl
          options={humidifierModes()}
          value={mode}
          onSelect={sendMode}
          disabled={sending}
        />
      </ControlSection>
      {mode === HUMIDITY_MODE && (
        <ControlSection>
          <Slider
            label={t("control.targetHumidity")}
            valueLabel={`${target}%`}
            min={0}
            max={100}
            value={target}
            disabled={sending}
            onChange={setTarget}
            onCommit={() => sendMode(HUMIDITY_MODE)}
          />
        </ControlSection>
      )}
      <ToggleRow
        title={t("control.childLock")}
        on={childLockOf(status)}
        onSelect={(on) => send("setChildLock", on)}
        disabled={sending}
      />
    </>
  );
}

const thermostatModes = () =>
  [
    { value: 0, label: t("thermo.schedule") },
    { value: 1, label: t("thermo.manual") },
    { value: 3, label: t("thermo.eco") },
    { value: 4, label: t("thermo.comfort") },
    { value: 5, label: t("thermo.boost") },
  ] as const;

/**
 * Smart Radiator Thermostat. Mode 2 is "power off", which turnOff already
 * covers, so it is left out of the mode row.
 */
export function ThermostatControls({ status, send, sending }: PanelProps) {
  const [temperature, setTemperature] = useState(20);
  const mode = numericMode(status);

  useEffect(() => {
    if (typeof status?.temperature === "number")
      setTemperature(Math.round(status.temperature));
  }, [status?.temperature]);

  return (
    <>
      <ControlSection title={t("control.mode")}>
        <SegmentControl
          options={thermostatModes()}
          value={mode}
          onSelect={(next) => send("setMode", next)}
          disabled={sending}
        />
      </ControlSection>
      <ControlSection>
        <Slider
          label={t("control.temperature")}
          valueLabel={`${temperature}°C`}
          min={4}
          max={35}
          value={temperature}
          disabled={sending}
          onChange={setTemperature}
          onCommit={() => send("setManualModeTemperature", temperature)}
        />
      </ControlSection>
    </>
  );
}

/** Circulator fans: wind mode, stepless speed and a nightlight. */
export function WindControls({
  deviceType,
  status,
  send,
  sending,
}: PanelProps & { deviceType: string }) {
  const [speed, setSpeed] = useState(1);
  const profile = getFanProfile(deviceType);
  const mode = typeof status?.mode === "string" ? status.mode : undefined;

  useEffect(() => {
    if (typeof status?.fanSpeed === "number") setSpeed(status.fanSpeed);
  }, [status?.fanSpeed]);

  return (
    <>
      <ControlSection title={t("control.mode")}>
        <SegmentControl
          options={profile.modes.map((m) => ({ value: m.value, label: t(m.key) }))}
          value={mode}
          onSelect={(next) => send("setWindMode", next)}
          disabled={sending}
        />
      </ControlSection>
      <ControlSection>
        <Slider
          label={t("control.fanSpeed")}
          valueLabel={`${speed}`}
          min={1}
          max={100}
          value={speed}
          disabled={sending}
          onChange={setSpeed}
          onCommit={() => send("setWindSpeed", speed)}
        />
      </ControlSection>
      <ControlSection title={t("control.nightLight")}>
        <SegmentControl
          options={profile.nightLight.map((n) => ({
            value: n.value,
            label: t(n.key),
          }))}
          value={status?.nightStatus}
          onSelect={(next) => send("setNightLightMode", next)}
          disabled={sending}
        />
      </ControlSection>
    </>
  );
}
