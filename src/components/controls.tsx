import type { CSSProperties, ReactNode } from "react";

/** デバイスへコマンドを送信する関数 (parameter/commandType は省略時 "default"/"command") */
export type SendFn = (
  command: string,
  parameter?: unknown,
  commandType?: string,
) => void;

export function ControlSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="control-section">
      {title && <div className="control-section-title">{title}</div>}
      {children}
    </div>
  );
}

export function ActionRow({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="action-buttons" style={style}>
      {children}
    </div>
  );
}

export function ActionButton({
  primary = false,
  onClick,
  disabled = false,
  children,
}: {
  primary?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      className={`action-btn ${primary ? "action-btn-primary" : "action-btn-secondary"}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/** range input の値を変更しうるキー (フォーカス移動の Tab などではコミットしない) */
const SLIDER_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

export function Slider({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  onCommit: () => void;
}) {
  return (
    <div className="slider-control">
      <div className="slider-header">
        <span className="slider-label">{label}</span>
        <span className="slider-value">{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={(e) => {
          if (SLIDER_KEYS.has(e.key)) onCommit();
        }}
      />
    </div>
  );
}

export function SegmentControl<T extends string | number>({
  options,
  value,
  onSelect,
  disabled = false,
}: {
  options: readonly { value: T; label: string }[];
  value?: T;
  onSelect: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="segment-control">
      {options.map((o) => (
        <button
          key={o.value}
          className={`segment-btn ${o.value === value ? "active" : ""}`}
          onClick={() => onSelect(o.value)}
          disabled={disabled}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PowerToggle({
  on,
  onToggle,
  disabled = false,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <ControlSection>
      <div className="power-toggle">
        <button
          className={`power-btn ${on ? "on" : ""}`}
          onClick={onToggle}
          disabled={disabled}
        >
          ⏻
        </button>
        <span className="power-label">{on ? "ON" : "OFF"}</span>
      </div>
    </ControlSection>
  );
}

export function PowerButtons({
  send,
  sending,
}: {
  send: SendFn;
  sending: boolean;
}) {
  return (
    <ControlSection>
      <ActionRow>
        <ActionButton primary onClick={() => send("turnOn")} disabled={sending}>
          ON
        </ActionButton>
        <ActionButton onClick={() => send("turnOff")} disabled={sending}>
          OFF
        </ActionButton>
      </ActionRow>
    </ControlSection>
  );
}
