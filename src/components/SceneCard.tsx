import { memo } from "react";
import type { Scene, TeamSettings } from "../types";
import { Board } from "./Board";

export interface SceneCardProps {
  scene: Scene;
  home: TeamSettings;
  away: TeamSettings;
  index: number;
  active: boolean;
  onAir: boolean;
  onSelect: (id: string) => void;
}

export const SceneCard = memo(function SceneCard({
  scene,
  home,
  away,
  index,
  active,
  onAir,
  onSelect,
}: SceneCardProps) {
  return (
    <button
      className={`scene-card ${active ? "active" : ""}`}
      onClick={() => onSelect(scene.id)}
      aria-label={`Scene ${index + 1}: ${scene.name}`}
    >
      <div className="scene-thumb">
        <Board
          scene={{ ...scene, showNames: false, showGrid: false }}
          home={home}
          away={away}
          interactive={false}
        />
        <span className="scene-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        {onAir && <span className="live-tag">PGM</span>}
        <span className="scene-length">{scene.duration}s</span>
      </div>
      <div className="scene-caption">
        <span>{scene.name}</span>
        {active && <span className="lime-dot" />}
      </div>
    </button>
  );
});
