import { useEffect, useState } from "react";
import type { ControlKind } from "../deviceRegistry";
import { t } from "../i18n";
import { deviceColorToHex, hexToDeviceColor } from "../status";
import type { DeviceStatus } from "../types";
import {
  ActionButton,
  ActionRow,
  ControlSection,
  PowerToggle,
  Slider,
  type SendFn,
} from "./controls";

interface Props {
  controls: ControlKind[];
  status: DeviceStatus | null;
  send: SendFn;
  sending: boolean;
}

export function PhysicalControls({ controls, status, send, sending }: Props) {
  const [brightness, setBrightness] = useState(100);
  const [colorTemp, setColorTemp] = useState(3500);
  const [position, setPosition] = useState(0);
  const [humidity, setHumidity] = useState(50);
  const [color, setColor] = useState("#ffffff");

  useEffect(() => {
    if (!status) return;
    if (typeof status.brightness === "number") setBrightness(status.brightness);
    if (typeof status.colorTemperature === "number")
      setColorTemp(status.colorTemperature);
    if (typeof status.slidePosition === "number")
      setPosition(status.slidePosition);
    if (typeof status.nebulizationEfficiency === "number")
      setHumidity(status.nebulizationEfficiency);
    if (status.color) setColor(deviceColorToHex(status.color));
  }, [status]);

  const isOn = status?.power === "on";

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

      {controls.includes("position") && (
        <ControlSection title={t("control.curtain")}>
          <Slider
            label={t("control.position")}
            valueLabel={`${position}%`}
            min={0}
            max={100}
            value={position}
            disabled={sending}
            onChange={setPosition}
            onCommit={() => send("setPosition", `0,ff,${position}`)}
          />
          <ActionRow>
            <ActionButton primary onClick={() => send("turnOn")} disabled={sending}>
              {t("control.open")}
            </ActionButton>
            <ActionButton onClick={() => send("turnOff")} disabled={sending}>
              {t("control.close")}
            </ActionButton>
          </ActionRow>
        </ControlSection>
      )}

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
        </ControlSection>
      )}

      {controls.includes("vacuum") && (
        <ControlSection title={t("control.vacuum")}>
          <ActionRow>
            <ActionButton primary onClick={() => send("start")} disabled={sending}>
              {t("control.start")}
            </ActionButton>
            <ActionButton onClick={() => send("stop")} disabled={sending}>
              {t("control.stop")}
            </ActionButton>
          </ActionRow>
          <ActionRow style={{ marginTop: 8 }}>
            <ActionButton onClick={() => send("dock")} disabled={sending}>
              {t("control.dock")}
            </ActionButton>
          </ActionRow>
        </ControlSection>
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
    </>
  );
}
