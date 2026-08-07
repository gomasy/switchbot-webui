import { useEffect, useState } from "react";
import {
  formatPosition,
  getCategory,
  getLockCommands,
  type ControlKind,
} from "../deviceRegistry";
import { t } from "../i18n";
import { childLockOf, deviceColorToHex, hexToDeviceColor } from "../status";
import {
  Humidifier2Controls,
  PurifierControls,
  ThermostatControls,
  WindControls,
} from "./ClimateControls";
import {
  ActionButton,
  ActionRow,
  ControlSection,
  OnOffButtons,
  PowerToggle,
  SegmentControl,
  Slider,
  TextCommandForm,
  ToggleRow,
  type PanelProps,
} from "./controls";
import { DualLightControls } from "./DualLightControls";
import { VacuumControls } from "./VacuumControls";

interface Props extends PanelProps {
  controls: ControlKind[];
  deviceType: string;
}

const companionModes = () =>
  [
    { value: "Normal", label: t("companion.normal") },
    { value: "Standby", label: t("companion.standby") },
    { value: "Sleep", label: t("companion.sleep") },
  ] as const;

/** Companion-robot features that are all plain on/off switches. */
const COMPANION_SWITCHES = ["pictureTaking", "snapshots", "talk"] as const;

export function PhysicalControls({
  controls,
  deviceType,
  status,
  send,
  sending,
}: Props) {
  const [brightness, setBrightness] = useState(100);
  const [colorTemp, setColorTemp] = useState(3500);
  const [position, setPosition] = useState(0);
  const [humidity, setHumidity] = useState(50);
  const [color, setColor] = useState("#ffffff");
  const category = getCategory(deviceType);
  const lockCommands = getLockCommands(deviceType);

  useEffect(() => {
    if (!status) return;
    if (typeof status.brightness === "number") setBrightness(status.brightness);
    if (typeof status.colorTemperature === "number")
      setColorTemp(status.colorTemperature);
    if (typeof status.slidePosition === "number") setPosition(status.slidePosition);
    // Relay Switch 2PM reports its roller-blind position under its own name.
    if (typeof status.position === "number") setPosition(status.position);
    if (typeof status.nebulizationEfficiency === "number")
      setHumidity(status.nebulizationEfficiency);
    if (status.color) setColor(deviceColorToHex(status.color));
  }, [status]);

  const isOn = status?.power === "on";
  // Blind Tilt positions are relative to whichever way the blind opens.
  const direction = status?.direction === "down" ? "down" : "up";
  // A 2PM only reports — and only accepts — a position when it drives a blind.
  const hasPosition =
    controls.includes("position") &&
    (category !== "relay2" || typeof status?.position === "number");

  return (
    <>
      {controls.includes("power") && (
        <PowerToggle
          on={isOn}
          onToggle={() => send(isOn ? "turnOff" : "turnOn")}
          disabled={sending}
        />
      )}

      {controls.includes("press") && (
        <ControlSection>
          <ActionRow>
            <ActionButton primary onClick={() => send("press")} disabled={sending}>
              Press
            </ActionButton>
          </ActionRow>
        </ControlSection>
      )}

      {controls.includes("brightness") && (
        <ControlSection>
          <Slider
            label={t("control.brightness")}
            valueLabel={`${brightness}%`}
            min={0}
            max={100}
            value={brightness}
            disabled={sending}
            onChange={setBrightness}
            onCommit={() => send("setBrightness", brightness)}
          />
        </ControlSection>
      )}

      {controls.includes("color") && (
        <ControlSection>
          <div className="control-row">
            <span className="control-label">{t("control.color")}</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              onBlur={() => send("setColor", hexToDeviceColor(color))}
            />
          </div>
        </ControlSection>
      )}

      {controls.includes("colorTemp") && (
        <ControlSection>
          <Slider
            label={t("control.colorTemperature")}
            valueLabel={`${colorTemp}K`}
            min={2700}
            max={6500}
            step={100}
            value={colorTemp}
            disabled={sending}
            onChange={setColorTemp}
            onCommit={() => send("setColorTemperature", colorTemp)}
          />
        </ControlSection>
      )}

      {controls.includes("dualLight") && (
        <DualLightControls status={status} send={send} sending={sending} />
      )}

      {hasPosition && (
        <ControlSection
          title={category === "curtain" ? t("control.curtain") : t("control.rollerShade")}
        >
          <Slider
            label={t("control.position")}
            valueLabel={`${position}%`}
            min={0}
            max={100}
            value={position}
            disabled={sending}
            onChange={setPosition}
            onCommit={() => send("setPosition", formatPosition(category, position))}
          />
          {category === "curtain" && (
            <ActionRow>
              <ActionButton primary onClick={() => send("turnOn")} disabled={sending}>
                {t("control.open")}
              </ActionButton>
              <ActionButton onClick={() => send("pause")} disabled={sending}>
                {t("control.pause")}
              </ActionButton>
              <ActionButton onClick={() => send("turnOff")} disabled={sending}>
                {t("control.close")}
              </ActionButton>
            </ActionRow>
          )}
        </ControlSection>
      )}

      {controls.includes("blindTilt") && (
        <ControlSection title={t("control.blindTilt")}>
          <Slider
            label={t("control.position")}
            valueLabel={`${position}%`}
            min={0}
            max={100}
            step={2}
            value={position}
            disabled={sending}
            onChange={setPosition}
            // The API rejects odd positions, hence the step of 2 above.
            onCommit={() => send("setPosition", `${direction};${position}`)}
          />
          <ActionRow>
            <ActionButton primary onClick={() => send("fullyOpen")} disabled={sending}>
              {t("control.open")}
            </ActionButton>
            <ActionButton onClick={() => send("closeUp")} disabled={sending}>
              {t("control.closeUp")}
            </ActionButton>
            <ActionButton onClick={() => send("closeDown")} disabled={sending}>
              {t("control.closeDown")}
            </ActionButton>
          </ActionRow>
        </ControlSection>
      )}

      {controls.includes("relayChannels") &&
        ([1, 2] as const).map((channel) => (
          <ControlSection key={channel} title={`${t("control.channel")} ${channel}`}>
            <OnOffButtons
              on={
                typeof status?.[`switch${channel}Status`] === "number"
                  ? status[`switch${channel}Status`] === 1
                  : undefined
              }
              onSelect={(on) => send(on ? "turnOn" : "turnOff", `${channel}`)}
              disabled={sending}
            />
          </ControlSection>
        ))}

      {controls.includes("lock") && (
        <ControlSection title={t("control.lockControl")}>
          <ActionRow>
            <ActionButton primary onClick={() => send("lock")} disabled={sending}>
              {t("control.lock")}
            </ActionButton>
            <ActionButton onClick={() => send("unlock")} disabled={sending}>
              {t("control.unlock")}
            </ActionButton>
          </ActionRow>
          {lockCommands.length > 0 && (
            <ActionRow style={{ marginTop: 8 }}>
              {lockCommands.map((command) => (
                <ActionButton
                  key={command}
                  onClick={() => send(command)}
                  disabled={sending}
                >
                  {t(`control.${command}`)}
                </ActionButton>
              ))}
            </ActionRow>
          )}
        </ControlSection>
      )}

      {controls.includes("vacuum") && (
        <VacuumControls deviceType={deviceType} send={send} sending={sending} />
      )}

      {controls.includes("humidity") && (
        <ControlSection>
          <Slider
            label={t("control.humidification")}
            valueLabel={`${humidity}%`}
            min={0}
            max={100}
            value={humidity}
            disabled={sending}
            onChange={setHumidity}
            onCommit={() => send("setMode", `${humidity}`)}
          />
        </ControlSection>
      )}

      {controls.includes("humidifier2") && (
        <Humidifier2Controls status={status} send={send} sending={sending} />
      )}

      {controls.includes("purifier") && (
        <PurifierControls status={status} send={send} sending={sending} />
      )}

      {controls.includes("wind") && (
        <WindControls
          deviceType={deviceType}
          status={status}
          send={send}
          sending={sending}
        />
      )}

      {controls.includes("thermostat") && (
        <ThermostatControls status={status} send={send} sending={sending} />
      )}

      {controls.includes("motionDetection") && (
        <ToggleRow
          title={t("control.motionDetection")}
          onSelect={(on) =>
            send(on ? "enableMotionDetection" : "disableMotionDetection")
          }
          disabled={sending}
        />
      )}

      {controls.includes("artFrame") && (
        <>
          <ControlSection title={t("control.image")}>
            <ActionRow>
              <ActionButton onClick={() => send("previous")} disabled={sending}>
                {t("control.prev")}
              </ActionButton>
              <ActionButton onClick={() => send("next")} disabled={sending}>
                {t("control.next")}
              </ActionButton>
            </ActionRow>
          </ControlSection>
          <TextCommandForm
            title={t("control.uploadImage")}
            placeholder="https://..."
            submitLabel={t("control.send")}
            disabled={sending}
            onSubmit={(imageUrl) => send("uploadImage", { imageUrl })}
          />
        </>
      )}

      {controls.includes("weatherText") && (
        <>
          <TextCommandForm
            title={t("control.customQuote")}
            placeholder={t("control.enterText")}
            submitLabel={t("control.send")}
            disabled={sending}
            onSubmit={(text) => send("customQuote", text)}
          />
          <TextCommandForm
            title={t("control.customPage")}
            placeholder={t("control.enterText")}
            submitLabel={t("control.send")}
            disabled={sending}
            onSubmit={(text) => send("customPage", text)}
          />
          <ControlSection>
            <ActionRow>
              <ActionButton onClick={() => send("cancelCustom")} disabled={sending}>
                {t("control.cancelCustom")}
              </ActionButton>
            </ActionRow>
          </ControlSection>
        </>
      )}

      {controls.includes("companion") && (
        <>
          <ControlSection title={t("control.mode")}>
            <SegmentControl
              options={companionModes()}
              value={typeof status?.mode === "string" ? status.mode : undefined}
              onSelect={(mode) => send("mode", mode)}
              disabled={sending}
            />
          </ControlSection>
          <ControlSection>
            <ActionRow>
              <ActionButton primary onClick={() => send("backHome")} disabled={sending}>
                {t("control.backHome")}
              </ActionButton>
            </ActionRow>
          </ControlSection>
          <ToggleRow
            title={t("control.childLock")}
            on={childLockOf(status)}
            onSelect={(on) => send("childLock", on ? "on" : "off")}
            disabled={sending}
          />
          {COMPANION_SWITCHES.map((command) => (
            <ToggleRow
              key={command}
              title={t(`control.${command}`)}
              onSelect={(on) => send(command, on ? "on" : "off")}
              disabled={sending}
            />
          ))}
        </>
      )}
    </>
  );
}
