import { t } from "../i18n";
import { VERSION } from "../version";

interface Props {
  loading: boolean;
  onRefresh: () => void;
  darkMode: boolean;
  onToggleTheme: () => void;
}

export function Header({ loading, onRefresh, darkMode, onToggleTheme }: Props) {
  return (
    <header className="header">
      <div className="header-brand">
        <span className="header-title">SwitchBot</span>
        <span className="header-version">{VERSION}</span>
      </div>
      <div className="header-actions">
        <button
          className="btn-icon"
          onClick={onToggleTheme}
          aria-label={t("header.toggleTheme")}
        >
          {darkMode ? "☀️" : "🌙"}
        </button>
        <button
          className={`btn-icon ${loading ? "spinning" : ""}`}
          onClick={onRefresh}
          disabled={loading}
          aria-label={t("header.refresh")}
        >
          ↻
        </button>
      </div>
    </header>
  );
}
