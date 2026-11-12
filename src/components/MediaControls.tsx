import { ImagePlus, Move, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { Scene, Tool, MediaTransform } from "../types";
import {
  normalizeMediaTransform,
  DEFAULT_MEDIA_TRANSFORM,
} from "../lib/media-transform";
import "./media.css";

export interface MediaControlsProps {
  scene: Scene;
  onChange: (patch: Partial<Scene>) => void;
  onUpload: () => void;
  onToolChange: (tool: Tool) => void;
  tool?: Tool;
}
export function MediaControls({
  scene,
  onChange,
  onUpload,
  onToolChange,
  tool,
}: MediaControlsProps) {
  const transform = normalizeMediaTransform(scene.mediaTransform);
  const available = scene.background === "media" && !!scene.mediaId;
  const update = (patch: Partial<MediaTransform>) =>
    onChange({
      mediaTransform: normalizeMediaTransform({ ...transform, ...patch }),
    });
  return (
    <div className="media-controls" role="group" aria-label="Picture controls">
      <span className="media-control-label">PICTURE</span>
      <button
        className="media-tool-button"
        onClick={onUpload}
        aria-label="Add picture or video"
      >
        <ImagePlus size={15} />
        <span>Add picture / video</span>
      </button>
      <button
        className={`media-tool-button ${tool === "media" ? "active" : ""}`}
        disabled={!available}
        onClick={() => onToolChange(tool === "media" ? "select" : "media")}
        aria-label="Move and resize picture"
        aria-pressed={tool === "media"}
      >
        <Move size={15} />
        <span>Move & resize</span>
      </button>
      <details className="media-adjust">
        <summary aria-label="Adjust picture">
          <SlidersHorizontal size={15} />
          <span>Adjust</span>
        </summary>
        <div className="media-adjust-panel">
          <div className="media-adjust-title">
            <strong>Picture position</strong>
            <span>
              {available
                ? "Changes apply to this scene"
                : "Add a picture or video first"}
            </span>
          </div>
          <label>
            Size <output>{Math.round(transform.scale * 100)}%</output>
            <input
              aria-label="Picture size"
              type="range"
              min="10"
              max="400"
              step="5"
              value={Math.round(transform.scale * 100)}
              disabled={!available}
              onChange={(e) => update({ scale: Number(e.target.value) / 100 })}
            />
          </label>
          <div className="media-position-fields">
            <label>
              Horizontal (%)
              <input
                aria-label="Picture horizontal position"
                type="number"
                min="-100"
                max="100"
                step="1"
                value={Math.round(transform.x)}
                disabled={!available}
                onChange={(e) => update({ x: Number(e.target.value) })}
              />
            </label>
            <label>
              Vertical (%)
              <input
                aria-label="Picture vertical position"
                type="number"
                min="-100"
                max="100"
                step="1"
                value={Math.round(transform.y)}
                disabled={!available}
                onChange={(e) => update({ y: Number(e.target.value) })}
              />
            </label>
          </div>
          <label>
            Rotation <output>{Math.round(transform.rotation)}°</output>
            <input
              aria-label="Picture rotation"
              type="range"
              min="-180"
              max="180"
              step="1"
              value={Math.round(transform.rotation)}
              disabled={!available}
              onChange={(e) => update({ rotation: Number(e.target.value) })}
            />
          </label>
          <div className="media-fit-row">
            <label>
              Fit
              <select
                aria-label="Picture fit"
                value={transform.fit}
                disabled={!available}
                onChange={(e) =>
                  update({ fit: e.target.value as MediaTransform["fit"] })
                }
              >
                <option value="contain">Fit whole picture</option>
                <option value="cover">Fill canvas</option>
              </select>
            </label>
            <button
              className="media-tool-button"
              disabled={!available}
              aria-label="Reset picture position"
              onClick={() =>
                onChange({ mediaTransform: { ...DEFAULT_MEDIA_TRANSFORM } })
              }
            >
              <RotateCcw size={14} />
              Reset
            </button>
          </div>
          <p>
            Choose Move & resize, then drag the picture or a corner handle.
            Drawings stay in place.
          </p>
        </div>
      </details>
      {available && (
        <span className="media-size-readout">
          {Math.round(transform.scale * 100)}%
        </span>
      )}
    </div>
  );
}
