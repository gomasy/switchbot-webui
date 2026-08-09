import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { DeviceStatus } from "../types";

/** Send a command to a device (parameter/commandType default to "default"/"command"). */
export type SendFn = (
  command: string,
  parameter?: unknown,
  commandType?: string,
) => Promise<boolean>;

/** What every device-specific control panel is handed. */
export interface PanelProps {
  status: DeviceStatus | null;
  send: SendFn;
  sending: boolean;
}

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

/** A section whose whole content is one row of buttons. */
export function ButtonSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <ControlSection title={title}>
      <ActionRow>{children}</ActionRow>
    </ControlSection>
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

/** Keys that change a range input's value (Tab etc. move focus without committing). */
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
  disabled = false,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  onCommit: () => void;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const endDrag = () => {
    setDragging(false);
    onCommit();
  };

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
        // Never disable mid-drag: a disabled input stops firing pointerup, so
        // the value the user already moved would never be committed.
        disabled={disabled && !dragging}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={() => setDragging(true)}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
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

/**
 * A one-line form for commands whose parameter is free text the API cannot
 * enumerate for us — a user-defined remote button, a custom display message.
 */
export function TextCommandForm({
  title,
  placeholder,
  submitLabel,
  onSubmit,
  disabled = false,
}: {
  title: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (value: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <ControlSection title={title}>
      <form
        className="custom-btn-form"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = value.trim();
          if (trimmed) onSubmit(trimmed);
        }}
      >
        <input
          type="text"
          className="custom-btn-input"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="submit"
          className="action-btn action-btn-primary"
          disabled={disabled || !value.trim()}
        >
          {submitLabel}
        </button>
      </form>
    </ControlSection>
  );
}

/**
 * A two-button on/off pair. The button matching the current state is
 * highlighted; when the state is unknown, neither is.
 */
export function OnOffButtons({
  on,
  onSelect,
  disabled = false,
}: {
  on?: boolean;
  onSelect: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <ActionRow>
      <ActionButton primary={on === true} onClick={() => onSelect(true)} disabled={disabled}>
        ON
      </ActionButton>
      <ActionButton primary={on === false} onClick={() => onSelect(false)} disabled={disabled}>
        OFF
      </ActionButton>
    </ActionRow>
  );
}

/** An on/off pair in a section of its own, for a setting such as a child lock. */
export function ToggleRow({
  title,
  ...buttons
}: {
  title: string;
  on?: boolean;
  onSelect: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <ControlSection title={title}>
      <OnOffButtons {...buttons} />
    </ControlSection>
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
    <ButtonSection>
      <ActionButton primary onClick={() => send("turnOn")} disabled={sending}>
        ON
      </ActionButton>
      <ActionButton onClick={() => send("turnOff")} disabled={sending}>
        OFF
      </ActionButton>
    </ButtonSection>
  );
}
