import type { Scene } from "../types";

interface Props {
  scenes: Scene[];
  executingScene: string | null;
  onExecute: (sceneId: string) => void;
}

export function SceneList({ scenes, executingScene, onExecute }: Props) {
  return (
    <>
      <div className="section-title">シーン</div>
      {scenes.length > 0 ? (
        <div className="scene-list">
          {scenes.map((s) => (
            <div key={s.sceneId} className="scene-card">
              <div className="scene-card-left">
                <span className="scene-card-icon">⚡</span>
                <span className="scene-card-name">{s.sceneName}</span>
              </div>
              <button
                className="scene-card-run"
                onClick={() => onExecute(s.sceneId)}
                disabled={executingScene === s.sceneId}
              >
                {executingScene === s.sceneId ? "実行中..." : "実行"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">⚡</div>
          <div className="empty-state-text">シーンが見つかりません</div>
        </div>
      )}
    </>
  );
}
