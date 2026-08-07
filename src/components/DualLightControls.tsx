import { useEffect, useState } from "react";
import { t } from "../i18n";
import { deviceColorToHex, hexToDeviceColor } from "../status";
import {
  ControlSection,
  OnOffButtons,
  PowerToggle,
  Slider,
  type PanelProps,
} from "./controls";

/** Whether one of the two light channels is on, or undefined before it loads. */
function channelOn(power: string | undefined): boolean | undefined {
  return power === undefined ? undefined : power === "on";
}

/**
 * RGBICWW Ceiling Light, which drives a white main light and a color accent
 * light independently. Its overall `power` reads "partial" when only one of
 * the two is on, so the master toggle turns everything off in that case.
 */
export function DualLightControls({ status, send, sending }: PanelProps) {
  const [mainBrightness, setMainBrightness] = useState(100);
  const [mainColorTemp, setMainColorTemp] = useState(3500);
  const [colorBrightness, setColorBrightness] = useState(100);
  const [color, setColor] = useState("#ffffff");

  useEffect(() => {
    if (!status) return;
    if (typeof status.mainLightBrightness === "number")
      setMainBrightness(status.mainLightBrightness);
    if (typeof status.mainLightColorTemp === "number")
      setMainColorTemp(status.mainLightColorTemp);
    if (typeof status.colorLightBrightness === "number")
      setColorBrightness(status.colorLightBrightness);
    if (status.colorLightRGB) setColor(deviceColorToHex(status.colorLightRGB));
  }, [status]);

  const anyOn = status?.power === "on" || status?.power === "partial";

  return (
    <>
      <PowerToggle
        on={status?.power === "on"}
        onToggle={() => send(anyOn ? "turnOff" : "turnOn")}
        disabled={sending}
      />

      <ControlSection title={t("control.mainLight")}>
        <OnOffButtons
          on={channelOn(status?.mainLightPower)}
          onSelect={(on) => send(on ? "turnOnMainLight" : "turnOffMainLight")}
          disabled={sending}
        />
        <Slider
          label={t("control.brightness")}
          valueLabel={`${mainBrightness}%`}
          min={1}
          max={100}
          value={mainBrightness}
          disabled={sending}
          onChange={setMainBrightness}
          onCommit={() => send("setMainLightBrightness", mainBrightness)}
        />
        <Slider
          label={t("control.colorTemperature")}
          valueLabel={`${mainColorTemp}K`}
          min={2700}
          max={6500}
          step={100}
          value={mainColorTemp}
          disabled={sending}
          onChange={setMainColorTemp}
          onCommit={() => send("setMainLightColorTemp", mainColorTemp)}
        />
      </ControlSection>

      <ControlSection title={t("control.colorLight")}>
        <OnOffButtons
          on={channelOn(status?.colorLightPower)}
          onSelect={(on) => send(on ? "turnOnColorLight" : "turnOffColorLight")}
          disabled={sending}
        />
        <Slider
          label={t("control.brightness")}
          valueLabel={`${colorBrightness}%`}
          min={1}
          max={100}
          value={colorBrightness}
          disabled={sending}
          onChange={setColorBrightness}
          onCommit={() => send("setColorLightBrightness", colorBrightness)}
        />
        <div className="control-row">
          <span className="control-label">{t("control.color")}</span>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            onBlur={() => send("setColorLightRGB", hexToDeviceColor(color))}
          />
        </div>
      </ControlSection>
    </>
  );
}
