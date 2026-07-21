import { t } from "../i18n";
import type { Scene } from "../types";

interface Props {
  scenes: Scene[];
  executingScene: string | null;
  onExecute: (sceneId: string) => void;
}

export function SceneList({ scenes, executingScene, onExecute }: Props) {
  return (
    <>
      <div className="section-title">{t("scene.title")}</div>
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
                {executingScene === s.sceneId ? t("scene.executing") : t("scene.execute")}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">⚡</div>
          <div className="empty-state-text">{t("scene.notFound")}</div>
        </div>
      )}
    </>
  );
}
