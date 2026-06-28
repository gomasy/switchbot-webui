interface Props {
  loading: boolean;
  onRefresh: () => void;
}

export function Header({ loading, onRefresh }: Props) {
  return (
    <header className="header">
      <span className="header-title">SwitchBot</span>
      <div className="header-actions">
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
