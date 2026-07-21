import { useState } from "react";
import { login } from "../api";
import { t } from "../i18n";

interface Props {
  onSuccess: () => void;
}

export function LoginScreen({ onSuccess }: Props) {
  const [token, setToken] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = token.trim();
    if (busy || !trimmed) return;
    setBusy(true);
    setFailed(false);
    try {
      if (await login(trimmed)) {
        onSuccess();
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-icon">🔐</div>
        <div className="login-title">SwitchBot WebUI</div>
        <div className="login-description">
          {t("auth.enterToken")}
        </div>
        <input
          type="password"
          className="login-input"
          placeholder={t("auth.tokenPlaceholder")}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoFocus
        />
        {failed && (
          <div className="login-error">{t("auth.invalidToken")}</div>
        )}
        <button
          type="submit"
          className="action-btn action-btn-primary"
          disabled={busy || !token.trim()}
        >
          {busy ? t("auth.verifying") : t("auth.login")}
        </button>
      </form>
    </div>
  );
}
