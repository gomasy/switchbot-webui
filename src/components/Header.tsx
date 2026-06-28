interface Props {
  loading: boolean;
  onRefresh: () => void;
  darkMode: boolean;
  onToggleTheme: () => void;
}

export function Header({ loading, onRefresh, darkMode, onToggleTheme }: Props) {
  return (
    <header className="header">
      <span className="header-title">SwitchBot</span>
      <div className="header-actions">
        <button
          className="btn-icon"
          onClick={onToggleTheme}
          aria-label="テーマ切替"
        >
          {darkMode ? "☀️" : "🌙"}
        </button>
        <button
          className={`btn-icon ${loading ? "spinning" : ""}`}
          onClick={onRefresh}
          disabled={loading}
          aria-label="更新"
        >
          ↻
        </button>
      </div>
    </header>
  );
}
