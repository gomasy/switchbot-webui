import { useState } from "react";
import { useStoredState } from "../hooks";
import { t } from "../i18n";
import type { InfraredDevice } from "../types";
import { ActionButton, type SendFn } from "./controls";

interface DiyButton {
  id: string;
  label: string;
}

interface Props {
  device: InfraredDevice;
  send: SendFn;
  sending: boolean;
}

export function DiyButtons({ device, send, sending }: Props) {
  const [buttons, setButtons] = useStoredState<DiyButton[]>(
    `custom-buttons-${device.deviceId}`,
    [],
  );
  const [editing, setEditing] = useState(false);
  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");

  return (
    <div className="control-section">
      <div className="control-section-header">
        <div className="control-section-title" style={{ marginBottom: 0 }}>
          {t("control.customButtons")}
        </div>
        <button className="edit-toggle-btn" onClick={() => setEditing((v) => !v)}>
          {editing ? t("control.done") : t("control.edit")}
        </button>
      </div>
      {buttons.length > 0 && (
        <div className="diy-button-grid">
          {buttons.map((btn) => (
            <div key={btn.id} className="diy-button-wrapper">
              <ActionButton
                onClick={() => send(btn.id, "default", "customize")}
                disabled={sending || editing}
              >
                {btn.label}
              </ActionButton>
              {editing && (
                <button
                  className="diy-remove-btn"
                  onClick={() =>
                    setButtons(buttons.filter((b) => b.id !== btn.id))
                  }
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && (
        <form
          className="diy-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            const id = newId.trim();
            const label = newLabel.trim();
            if (id && label && !buttons.some((b) => b.id === id)) {
              setButtons([...buttons, { id, label }]);
              setNewId("");
              setNewLabel("");
            }
          }}
        >
          <div className="diy-add-row">
            <input
              type="text"
              className="custom-btn-input"
              placeholder={t("control.buttonId")}
              inputMode="numeric"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              style={{ flex: 1 }}
            />
            <input
              type="text"
              className="custom-btn-input"
              placeholder={t("control.buttonLabel")}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              style={{ flex: 2 }}
            />
          </div>
          <button
            type="submit"
            className="action-btn action-btn-primary"
            disabled={!newId.trim() || !newLabel.trim()}
          >
            {t("control.add")}
          </button>
        </form>
      )}
      {buttons.length === 0 && !editing && (
        <div className="diy-empty">{t("control.customButtonsEmpty")}</div>
      )}
    </div>
  );
}
