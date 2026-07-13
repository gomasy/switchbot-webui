import { useEffect, useState } from "react";
import type { ControlKind } from "../deviceRegistry";
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
            label="明るさ"
            valueLabel={`${brightness}%`}
            min={0}
            max={100}
            value={brightness}
            onChange={setBrightness}
            onCommit={() => send("setBrightness", brightness)}
          />
        </ControlSection>
      )}

      {controls.includes("color") && (
        <ControlSection>
          <div className="control-row">
            <span className="control-label">カラー</span>
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
            label="色温度"
            valueLabel={`${colorTemp}K`}
            min={2700}
            max={6500}
            step={100}
            value={colorTemp}
            onChange={setColorTemp}
            onCommit={() => send("setColorTemperature", colorTemp)}
          />
        </ControlSection>
      )}

      {controls.includes("position") && (
        <ControlSection title="カーテン操作">
          <Slider
            label="位置"
            valueLabel={`${position}%`}
            min={0}
            max={100}
            value={position}
            onChange={setPosition}
            onCommit={() => send("setPosition", `0,ff,${position}`)}
          />
          <ActionRow>
            <ActionButton primary onClick={() => send("turnOn")} disabled={sending}>
              開く
            </ActionButton>
            <ActionButton onClick={() => send("turnOff")} disabled={sending}>
              閉じる
            </ActionButton>
          </ActionRow>
        </ControlSection>
      )}

      {controls.includes("lock") && (
        <ControlSection title="ロック操作">
          <ActionRow>
            <ActionButton primary onClick={() => send("lock")} disabled={sending}>
              施錠
            </ActionButton>
            <ActionButton onClick={() => send("unlock")} disabled={sending}>
              解錠
            </ActionButton>
          </ActionRow>
        </ControlSection>
      )}

      {controls.includes("vacuum") && (
        <ControlSection title="ロボット掃除機">
          <ActionRow>
            <ActionButton primary onClick={() => send("start")} disabled={sending}>
              開始
            </ActionButton>
            <ActionButton onClick={() => send("stop")} disabled={sending}>
              停止
            </ActionButton>
          </ActionRow>
          <ActionRow style={{ marginTop: 8 }}>
            <ActionButton onClick={() => send("dock")} disabled={sending}>
              充電に戻る
            </ActionButton>
          </ActionRow>
        </ControlSection>
      )}

      {controls.includes("humidity") && (
        <ControlSection>
          <Slider
            label="加湿量"
            valueLabel={`${humidity}%`}
            min={0}
            max={100}
            value={humidity}
            onChange={setHumidity}
            onCommit={() => send("setMode", `${humidity}`)}
          />
        </ControlSection>
      )}
    </>
  );
}
