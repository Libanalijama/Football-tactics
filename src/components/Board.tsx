import { useEffect, useId, useRef, useState } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import type {
  Annotation,
  MediaTransform,
  Player,
  Point,
  Scene,
  TeamSettings,
  Tool,
} from "../types";
import { clampPoint, playersAtTime } from "../lib/animation";
import {
  normalizeMediaTransform,
  mediaPlacement,
  mediaCssTransform,
  panMedia,
  resizeMedia,
} from "../lib/media-transform";
import { TacticalOverlays } from "./TacticalOverlays";

export const PITCH = { x: 30, y: 30, width: 1140, height: 720 };
export const toPitchPoint = (p: Point): Point => ({
  x: PITCH.x + (p.x * PITCH.width) / 100,
  y: PITCH.y + (p.y * PITCH.height) / 100,
});
export const fromPitchPoint = (p: Point): Point =>
  clampPoint({
    x: ((p.x - PITCH.x) / PITCH.width) * 100,
    y: ((p.y - PITCH.y) / PITCH.height) * 100,
  });

export interface BoardProps {
  scene: Scene;
  home: TeamSettings;
  away: TeamSettings;
  time?: number;
  tool?: Tool;
  color?: string;
  strokeWidth?: number;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (scene: Scene) => void;
  onGestureStart?: () => void;
  interactive?: boolean;
  mediaUrl?: string;
  videoRef?: RefObject<HTMLVideoElement | null>;
  transparent?: boolean;
  cleanOutput?: boolean;
}
export function annotationPath(a: Annotation): string {
  const p = a.points.map(toPitchPoint);
  if (!p.length) return "";
  const first = p[0],
    last = p[p.length - 1];
  if (a.type === "curve") {
    const dx = last.x - first.x,
      dy = last.y - first.y;
    return `M ${first.x} ${first.y} Q ${(first.x + last.x) / 2 + dy * 0.28} ${(first.y + last.y) / 2 - dx * 0.28} ${last.x} ${last.y}`;
  }
  return p
    .map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`)
    .join(" ");
}
export function AnnotationShape({
  annotation: a,
  selected = false,
  prefix = "annotation",
  calibrated = true,
}: {
  annotation: Annotation;
  selected?: boolean;
  prefix?: string;
  calibrated?: boolean;
}) {
  if (!a.points.length) return null;
  const p = a.points.map(toPitchPoint),
    first = p[0],
    last = p[p.length - 1];
  const x = Math.min(first.x, last.x),
    y = Math.min(first.y, last.y),
    width = Math.abs(last.x - first.x),
    height = Math.abs(last.y - first.y);
  const stroke = Math.max(1.5, a.width) * 1.25,
    safeId = `${prefix}-${a.id}`.replace(/[^a-zA-Z0-9_-]/g, ""),
    marker = `${safeId}-arrow`,
    hatch = `${safeId}-hatch`;
  let shape;
  switch (a.type) {
    case "heat": {
      const gradient = `${safeId}-heat`;
      shape = (
        <>
          <defs>
            <radialGradient id={gradient}>
              <stop offset="0" stopColor="#ff5041" stopOpacity=".85" />
              <stop offset=".35" stopColor="#ffd946" stopOpacity=".75" />
              <stop offset=".7" stopColor="#9ee642" stopOpacity=".4" />
              <stop offset="1" stopColor="#60d75a" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse
            cx={(first.x + last.x) / 2}
            cy={(first.y + last.y) / 2}
            rx={Math.max(30, width / 2)}
            ry={Math.max(24, height / 2)}
            fill={`url(#${gradient})`}
          />
        </>
      );
      break;
    }
    case "cone": {
      const dx = last.x - first.x,
        dy = last.y - first.y,
        length = Math.max(1, Math.hypot(dx, dy)),
        spread = Math.max(15, Math.min(110, length * 0.3));
      const px = (-dy / length) * spread,
        py = (dx / length) * spread,
        gradient = `${safeId}-spotlight`;
      shape = (
        <>
          <defs>
            <linearGradient
              id={gradient}
              gradientUnits="userSpaceOnUse"
              x1={first.x}
              y1={first.y}
              x2={last.x}
              y2={last.y}
            >
              <stop stopColor={a.color} stopOpacity=".06" />
              <stop offset="1" stopColor={a.color} stopOpacity=".26" />
            </linearGradient>
          </defs>
          <polygon
            points={`${first.x},${first.y} ${last.x + px},${last.y + py} ${last.x - px},${last.y - py}`}
            fill={`url(#${gradient})`}
            stroke={a.color}
            strokeOpacity=".45"
            strokeWidth={stroke * 0.5}
          />
          <circle cx={first.x} cy={first.y} r="4" fill={a.color} />
        </>
      );
      break;
    }
    case "link":
      shape = (
        <>
          <polygon
            points={p.map((point) => `${point.x},${point.y}`).join(" ")}
            fill={a.color}
            fillOpacity={p.length > 2 ? ".1" : "0"}
            stroke={a.color}
            strokeWidth={stroke}
            strokeLinejoin="round"
          />
          <circle cx={first.x} cy={first.y} r="4" fill={a.color} />
          <circle cx={last.x} cy={last.y} r="4" fill={a.color} />
        </>
      );
      break;
    case "distance": {
      const start = a.points[0],
        end = a.points[a.points.length - 1],
        distance = Math.hypot(
          (end.x - start.x) * 1.05,
          (end.y - start.y) * 0.68,
        ),
        label = calibrated ? `${distance.toFixed(1)} m` : "Guide";
      const cx = (first.x + last.x) / 2,
        cy = (first.y + last.y) / 2;
      shape = (
        <>
          <line
            x1={first.x}
            y1={first.y}
            x2={last.x}
            y2={last.y}
            stroke={a.color}
            strokeWidth={stroke}
            strokeDasharray="4 5"
          />
          <circle cx={first.x} cy={first.y} r="4" fill={a.color} />
          <circle cx={last.x} cy={last.y} r="4" fill={a.color} />
          <rect
            x={cx - 38}
            y={cy - 14}
            width="76"
            height="26"
            rx="5"
            fill="#101b20"
            stroke={a.color}
            strokeOpacity=".6"
          />
          <text
            x={cx}
            y={cy + 4}
            textAnchor="middle"
            fill={a.color}
            fontFamily="Arial,sans-serif"
            fontSize="12"
            fontWeight="700"
          >
            {label}
          </text>
        </>
      );
      break;
    }
    case "zone":
      shape = (
        <>
          <defs>
            <pattern
              id={hatch}
              width="12"
              height="12"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(35)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="12"
                stroke={a.color}
                strokeWidth="3"
                opacity=".32"
              />
            </pattern>
          </defs>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            rx="3"
            fill={a.color}
            fillOpacity=".08"
          />
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            rx="3"
            fill={`url(#${hatch})`}
            stroke={a.color}
            strokeWidth={stroke * 0.7}
          />
        </>
      );
      break;
    case "ellipse":
      shape = (
        <ellipse
          cx={(first.x + last.x) / 2}
          cy={(first.y + last.y) / 2}
          rx={Math.max(3, width / 2)}
          ry={Math.max(3, height / 2)}
          fill={a.color}
          fillOpacity=".12"
          stroke={a.color}
          strokeWidth={stroke}
        />
      );
      break;
    case "highlight": {
      const rx = Math.max(23, width),
        ry = Math.max(15, height * 0.62);
      shape = (
        <>
          <ellipse
            cx={first.x}
            cy={first.y}
            rx={rx + 8}
            ry={ry + 5}
            fill={a.color}
            fillOpacity=".06"
          />
          <ellipse
            cx={first.x}
            cy={first.y}
            rx={rx}
            ry={ry}
            fill={a.color}
            fillOpacity=".15"
            stroke={a.color}
            strokeWidth={stroke}
          />
          <ellipse
            cx={first.x}
            cy={first.y}
            rx={rx - 5}
            ry={ry - 3}
            fill="none"
            stroke={a.color}
            strokeWidth=".7"
            opacity=".4"
          />
        </>
      );
      break;
    }
    case "text":
      shape = (
        <g>
          <rect
            x={first.x - 10}
            y={first.y - 23}
            width={Math.max(72, (a.text || "Tactical note").length * 10 + 22)}
            height="36"
            rx="5"
            fill="#0c1518"
            fillOpacity=".91"
            stroke={a.color}
            strokeOpacity=".5"
          />
          <text
            x={first.x}
            y={first.y}
            fill={a.color}
            fontFamily="Inter, Arial, sans-serif"
            fontSize="17"
            fontWeight="600"
          >
            {a.text || "Tactical note"}
          </text>
        </g>
      );
      break;
    default: {
      const arrow =
          a.type === "arrow" || a.type === "curve" || a.type === "pass",
        path = annotationPath(a);
      shape = (
        <>
          <defs>
            <marker
              id={marker}
              markerWidth="15"
              markerHeight="12"
              refX="12"
              refY="6"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M 0 0 L 14 6 L 0 12 L 3.6 6 Z" fill={a.color} />
            </marker>
          </defs>
          <path
            d={path}
            fill="none"
            stroke="#000"
            strokeOpacity=".12"
            strokeWidth={stroke + 4}
            strokeLinecap="round"
          />
          <path
            d={path}
            fill="none"
            stroke={a.color}
            strokeWidth={stroke}
            strokeDasharray={a.type === "pass" ? "10 9" : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd={arrow ? `url(#${marker})` : undefined}
          />
          <path
            d={path}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(18, stroke + 12)}
            style={{ pointerEvents: "stroke" }}
          />
        </>
      );
    }
  }
  return (
    <g data-annotation-id={a.id} style={{ cursor: "inherit" }}>
      {selected && (
        <g opacity=".85" data-editor-only="true">
          <circle
            cx={first.x}
            cy={first.y}
            r="6"
            fill="#fff"
            stroke="#18232a"
            strokeWidth="2"
          />
          <circle
            cx={last.x}
            cy={last.y}
            r="6"
            fill="#fff"
            stroke="#18232a"
            strokeWidth="2"
          />
        </g>
      )}
      {shape}
    </g>
  );
}
function Pitch({
  theme,
  grid,
  prefix,
}: {
  theme: Scene["pitchTheme"];
  grid: boolean;
  prefix: string;
}) {
  const night = theme === "midnight",
    line = night ? "#a7c7c3" : "#c3ddc9";
  return (
    <g pointerEvents="none">
      <defs>
        <linearGradient id={`${prefix}-surface`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={night ? "#1c3538" : "#315d43"} />
          <stop offset="1" stopColor={night ? "#12292c" : "#204a34"} />
        </linearGradient>
        <radialGradient id={`${prefix}-vignette`} cx="50%" cy="42%" r="72%">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".25" />
        </radialGradient>
        <pattern
          id={`${prefix}-grass`}
          patternUnits="userSpaceOnUse"
          width="7"
          height="7"
        >
          <path
            d="M 1 6 L 2 3 M 5 5 L 5 2"
            stroke="#fff"
            opacity=".025"
            strokeWidth=".65"
          />
        </pattern>
      </defs>
      <rect
        width="1200"
        height="780"
        rx="12"
        fill={`url(#${prefix}-surface)`}
      />
      {Array.from({ length: 10 }, (_, i) => (
        <rect
          key={i}
          x={30 + i * 114}
          y="30"
          width="114"
          height="720"
          fill={i % 2 ? "#fff" : "#000"}
          fillOpacity={i % 2 ? ".025" : ".035"}
        />
      ))}
      <rect width="1200" height="780" rx="12" fill={`url(#${prefix}-grass)`} />
      <rect
        width="1200"
        height="780"
        rx="12"
        fill={`url(#${prefix}-vignette)`}
      />
      <g fill="none" stroke={line} strokeWidth="1.8" opacity=".72">
        <rect x="30" y="30" width="1140" height="720" />
        <line x1="600" y1="30" x2="600" y2="750" />
        <circle cx="600" cy="390" r="98" />
        <rect x="30" y="177" width="179" height="426" />
        <rect x="991" y="177" width="179" height="426" />
        <rect x="30" y="292" width="60" height="196" />
        <rect x="1110" y="292" width="60" height="196" />
        <path d="M 209 310 A 98 98 0 0 1 209 470 M 991 310 A 98 98 0 0 0 991 470" />
        <path d="M 30 52 A 22 22 0 0 0 52 30 M 1148 30 A 22 22 0 0 0 1170 52 M 1170 728 A 22 22 0 0 0 1148 750 M 52 750 A 22 22 0 0 0 30 728" />
        <rect x="16" y="351" width="14" height="78" opacity=".6" />
        <rect x="1170" y="351" width="14" height="78" opacity=".6" />
      </g>
      <g fill={line} opacity=".75">
        <circle cx="600" cy="390" r="3" />
        <circle cx="149" cy="390" r="2.8" />
        <circle cx="1051" cy="390" r="2.8" />
      </g>
      {grid && (
        <g stroke="#cde5d5" strokeWidth=".8" strokeDasharray="5 7" opacity=".2">
          {Array.from({ length: 5 }, (_, i) => (
            <line
              key={`v${i}`}
              x1={220 + i * 190}
              y1="30"
              x2={220 + i * 190}
              y2="750"
            />
          ))}
          {Array.from({ length: 3 }, (_, i) => (
            <line
              key={`h${i}`}
              x1="30"
              y1={210 + i * 180}
              x2="1170"
              y2={210 + i * 180}
            />
          ))}
        </g>
      )}
      <text
        x="600"
        y="771"
        textAnchor="middle"
        fill={line}
        opacity=".2"
        fontSize="8"
        fontFamily="Arial, sans-serif"
        letterSpacing="4"
      >
        BANG ON TACTICS
      </text>
    </g>
  );
}
function PlayerToken({
  player: p,
  team,
  showNames,
  showNumbers,
  selected,
  prefix,
  dragging,
}: {
  player: Player;
  team: TeamSettings;
  showNames: boolean;
  showNumbers: boolean;
  selected: boolean;
  prefix: string;
  dragging: boolean;
}) {
  const point = toPitchPoint(p),
    color =
      p.role === "GK"
        ? p.team === "home"
          ? "#f1ca68"
          : "#bc9cf5"
        : team.color;
  return (
    <g
      data-player-id={p.id}
      transform={`translate(${point.x} ${point.y})`}
      style={{ cursor: dragging ? "grabbing" : "inherit" }}
    >
      {p.highlighted && (
        <>
          <ellipse cy="5" rx="32" ry="25" fill={color} fillOpacity=".12" />
          <ellipse
            cy="5"
            rx="30"
            ry="23"
            fill="none"
            stroke={color}
            strokeWidth="1.8"
          />
        </>
      )}
      {selected && (
        <g data-editor-only="true">
          <ellipse cy="5" rx="32" ry="25" fill="#d4f484" fillOpacity=".12" />
          <ellipse
            cy="5"
            rx="30"
            ry="23"
            fill="none"
            stroke="#dcf8a2"
            strokeWidth="1.8"
            strokeDasharray="4 4"
          />
        </g>
      )}
      <ellipse cy="20" rx="21" ry="6" fill="#000" opacity=".22" />
      <circle cy="2" r="20" fill="#081a18" opacity=".25" />
      <circle r="19" fill={color} stroke="#ffffff" strokeWidth="1.9" />
      <circle cy="-1" r="16.6" fill={`url(#${prefix}-token-sheen)`} />
      {showNumbers && (
        <text
          y="6"
          textAnchor="middle"
          fill="#102020"
          fontFamily="Inter, Arial, sans-serif"
          fontWeight="800"
          fontSize="16"
          pointerEvents="none"
        >
          {p.number || "–"}
        </text>
      )}
      {showNames && p.name && (
        <g pointerEvents="none">
          <rect
            x={-Math.max(28, p.name.length * 3.3)}
            y="25"
            width={Math.max(56, p.name.length * 6.6)}
            height="20"
            rx="4"
            fill="#0c1e1b"
            fillOpacity=".77"
          />
          <text
            y="39"
            textAnchor="middle"
            fill="#e8f0ec"
            fontFamily="Inter, Arial, sans-serif"
            fontSize="11"
            fontWeight="550"
          >
            {p.name}
          </text>
        </g>
      )}
    </g>
  );
}
type Gesture =
  | { kind: "player"; id: string; start: Point; scene: Scene }
  | { kind: "annotation"; id: string; start: Point; scene: Scene }
  | { kind: "draw"; annotation: Annotation; scene: Scene }
  | { kind: "media"; start: Point; transform: MediaTransform; scene: Scene }
  | {
      kind: "media-resize";
      start: Point;
      transform: MediaTransform;
      center: Point;
      scene: Scene;
    };
export function Board({
  scene,
  home,
  away,
  time = 0,
  tool = "select",
  color = "#c6f36b",
  strokeWidth = 3,
  selectedId,
  onSelect,
  onChange,
  onGestureStart,
  interactive = false,
  mediaUrl,
  videoRef,
  transparent = false,
  cleanOutput = false,
}: BoardProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, ""),
    svgRef = useRef<SVGSVGElement>(null),
    gesture = useRef<Gesture | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [sourceSize, setSourceSize] = useState({ width: 1200, height: 780 });
  useEffect(() => {
    setVideoFailed(false);
    setSourceSize({ width: 1200, height: 780 });
  }, [mediaUrl]);
  const [preview, setPreview] = useState<Scene | null>(null);
  const display = preview || scene,
    players = preview ? preview.players : playersAtTime(scene, time),
    isMedia = scene.background === "media";
  const mediaTransform = normalizeMediaTransform(display.mediaTransform);
  const placement = mediaPlacement(
    sourceSize,
    { width: 1200, height: 780 },
    mediaTransform,
  );
  const mediaEditing =
    interactive && isMedia && tool === "media" && !!mediaUrl && !videoFailed;
  const viewBox =
    scene.camera === "half" && !isMedia ? "0 0 630 780" : "0 0 1200 780";
  const svgPosition = (e: ReactPointerEvent<SVGSVGElement>): Point => {
    const matrix = svgRef.current?.getScreenCTM();
    return matrix
      ? new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse())
      : { x: 600, y: 390 };
  };
  const position = (e: ReactPointerEvent<SVGSVGElement>): Point =>
    fromPitchPoint(svgPosition(e));
  const finish = () => {
    if (!gesture.current) return;
    const next = preview;
    gesture.current = null;
    setPreview(null);
    if (next) onChange?.(next);
  };
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!interactive || e.button !== 0) return;
    e.preventDefault();
    const target = e.target as Element,
      point = position(e);
    if (tool === "media") {
      if (!mediaEditing) return;
      onGestureStart?.();
      onSelect?.(null);
      gesture.current = target.closest("[data-media-handle]")
        ? {
            kind: "media-resize",
            start: svgPosition(e),
            transform: mediaTransform,
            center: placement.center,
            scene,
          }
        : {
            kind: "media",
            start: svgPosition(e),
            transform: mediaTransform,
            scene,
          };
      setPreview(scene);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    const playerId = target
        .closest("[data-player-id]")
        ?.getAttribute("data-player-id"),
      annotationId = target
        .closest("[data-annotation-id]")
        ?.getAttribute("data-annotation-id");
    if (tool === "erase") {
      if (annotationId) {
        onGestureStart?.();
        onChange?.({
          ...scene,
          annotations: scene.annotations.filter((a) => a.id !== annotationId),
        });
        onSelect?.(null);
      }
      return;
    }
    if (tool === "select") {
      onSelect?.(playerId || annotationId || null);
      if (!playerId && !annotationId) return;
      onGestureStart?.();
      gesture.current = playerId
        ? { kind: "player", id: playerId, start: point, scene }
        : { kind: "annotation", id: annotationId!, start: point, scene };
      setPreview({ ...scene, players });
    } else {
      onGestureStart?.();
      const annotation: Annotation = {
        id: crypto.randomUUID(),
        type: tool,
        points: [point, point],
        color,
        width: strokeWidth,
        ...(tool === "text" ? { text: "Tactical note" } : {}),
      };
      onSelect?.(annotation.id);
      gesture.current = { kind: "draw", annotation, scene };
      setPreview({ ...scene, annotations: [...scene.annotations, annotation] });
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active) return;
    if (active.kind === "media" || active.kind === "media-resize") {
      const next =
        active.kind === "media"
          ? panMedia(active.transform, active.start, svgPosition(e))
          : resizeMedia(
              active.transform,
              active.start,
              svgPosition(e),
              active.center,
            );
      setPreview({ ...active.scene, mediaTransform: next });
      return;
    }
    const point = position(e);
    if (active.kind === "draw") {
      const a = active.annotation,
        points =
          a.type === "freehand" || a.type === "link"
            ? [...a.points.slice(0, 3998), point]
            : [a.points[0], point];
      active.annotation = { ...a, points };
      setPreview({
        ...active.scene,
        annotations: [...active.scene.annotations, active.annotation],
      });
    } else if (active.kind === "player")
      setPreview({
        ...active.scene,
        players: playersAtTime(active.scene, time).map((p) =>
          p.id === active.id ? { ...p, ...point } : p,
        ),
      });
    else {
      const dx = point.x - active.start.x,
        dy = point.y - active.start.y;
      setPreview({
        ...active.scene,
        annotations: active.scene.annotations.map((a) =>
          a.id === active.id
            ? {
                ...a,
                points: a.points.map((p) =>
                  clampPoint({ x: p.x + dx, y: p.y + dy }),
                ),
              }
            : a,
        ),
      });
    }
  };
  const style: CSSProperties = {
    position: "relative",
    width: "100%",
    aspectRatio:
      scene.camera === "half" && !isMedia ? "630 / 780" : "1200 / 780",
    overflow: "hidden",
    borderRadius: 10,
    isolation: "isolate",
    background: transparent ? "transparent" : isMedia ? "#000" : "#14251e",
  };
  const basePlacement = mediaPlacement(
    sourceSize,
    { width: 1200, height: 780 },
    { ...mediaTransform, x: 0, y: 0, scale: 1, rotation: 0 },
  );
  const mediaStyle: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: `${basePlacement.width / 12}%`,
    height: `${basePlacement.height / 7.8}%`,
    maxWidth: "none",
    maxHeight: "none",
    objectFit: "fill",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
    visibility: videoFailed ? "hidden" : "visible",
  };
  return (
    <div
      className={`board-wrap${isMedia ? " board-media" : ""}`}
      style={style}
      data-testid="tactical-board"
    >
      {isMedia && !transparent && mediaUrl && (
        <div
          data-testid="positioned-media-layer"
          style={{
            position: "absolute",
            inset: 0,
            transform: mediaCssTransform(mediaTransform),
            transformOrigin: "50% 50%",
            pointerEvents: "none",
          }}
        >
          {videoRef ? (
            <video
              data-media-transform={JSON.stringify(mediaTransform)}
              onError={() => setVideoFailed(true)}
              ref={videoRef}
              src={mediaUrl}
              playsInline
              muted
              preload="auto"
              onLoadedMetadata={(e) => {
                setSourceSize({
                  width: e.currentTarget.videoWidth,
                  height: e.currentTarget.videoHeight,
                });
                if (Number.isFinite(scene.mediaTime))
                  e.currentTarget.currentTime = scene.mediaTime;
              }}
              style={mediaStyle}
            />
          ) : (
            <img
              data-media-transform={JSON.stringify(mediaTransform)}
              onError={() => setVideoFailed(true)}
              onLoad={(e) =>
                setSourceSize({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                })
              }
              src={mediaUrl}
              alt="Analysis footage"
              draggable={false}
              style={mediaStyle}
            />
          )}
        </div>
      )}
      {isMedia && !transparent && !mediaUrl && !cleanOutput && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeContent: "center",
            textAlign: "center",
            color: "#8c9c94",
            fontSize: 16,
            gap: 10,
          }}
        >
          <span style={{ fontSize: 40, opacity: 0.3 }}>◫</span>
          <span>Add a still or a video to this scene</span>
        </div>
      )}
      {isMedia && videoFailed && !cleanOutput && (
        <div
          role="alert"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeContent: "center",
            textAlign: "center",
            padding: 24,
            color: "#c5ced5",
            fontSize: 16,
            zIndex: 1,
            pointerEvents: "none",
          }}
        >
          <strong>This media cannot be played in this browser.</strong>
          <span style={{ fontSize: 12, marginTop: 10, color: "#8c9c94" }}>
            Use an H.264 MP4 video or a PNG/JPEG still.
          </span>
        </div>
      )}
      <svg
        ref={svgRef}
        className="board-svg"
        xmlns="http://www.w3.org/2000/svg"
        viewBox={viewBox}
        role="img"
        aria-label={
          isMedia
            ? "Media telestration canvas"
            : "Interactive football tactical board"
        }
        data-testid="board-svg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={() => {
          gesture.current = null;
          setPreview(null);
        }}
        onDoubleClick={(e) => {
          if (!interactive || tool === "media") return;
          const annotationId = (e.target as Element)
              .closest("[data-annotation-id]")
              ?.getAttribute("data-annotation-id"),
            a = scene.annotations.find(
              (item) => item.id === annotationId && item.type === "text",
            );
          if (a) {
            const text = window.prompt("Tactical label", a.text || "");
            if (text !== null) {
              onGestureStart?.();
              onChange?.({
                ...scene,
                annotations: scene.annotations.map((item) =>
                  item.id === a.id
                    ? { ...item, text: text.slice(0, 100) }
                    : item,
                ),
              });
            }
          }
        }}
        style={{
          position: "relative",
          display: "block",
          width: "100%",
          height: "100%",
          touchAction: interactive ? "none" : "auto",
          userSelect: "none",
          cursor: interactive
            ? tool === "media"
              ? "move"
              : tool === "select"
                ? "default"
                : tool === "erase"
                  ? "not-allowed"
                  : "crosshair"
            : "default",
          visibility:
            cleanOutput && isMedia && (videoFailed || !mediaUrl)
              ? "hidden"
              : "visible",
        }}
      >
        <defs>
          <linearGradient id={`${id}-token-sheen`} x1="0" x2=".6" y1="0" y2="1">
            <stop stopColor="#fff" stopOpacity=".26" />
            <stop offset=".5" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity=".1" />
          </linearGradient>
        </defs>
        {!isMedia && !transparent && (
          <Pitch theme={scene.pitchTheme} grid={scene.showGrid} prefix={id} />
        )}
        {!isMedia && !transparent && (
          <TacticalOverlays
            scene={display}
            players={players}
            home={home}
            away={away}
            time={time}
            selectedPlayerId={selectedId}
          />
        )}
        <g className="annotations">
          {display.annotations.map((a) => (
            <AnnotationShape
              key={a.id}
              annotation={a}
              selected={interactive && selectedId === a.id}
              prefix={id}
              calibrated={!isMedia}
            />
          ))}
        </g>
        {!isMedia && !transparent && (
          <g className="players">
            {players
              .filter((p) => p.onPitch)
              .map((p) => (
                <PlayerToken
                  key={p.id}
                  player={p}
                  team={p.team === "home" ? home : away}
                  showNames={scene.showNames}
                  showNumbers={scene.showNumbers}
                  selected={interactive && selectedId === p.id}
                  prefix={id}
                  dragging={
                    gesture.current?.kind === "player" &&
                    gesture.current.id === p.id
                  }
                />
              ))}
          </g>
        )}
        {mediaEditing && (
          <g
            data-editor-only="true"
            data-testid="media-transform-handles"
            transform={`translate(${placement.center.x} ${placement.center.y}) rotate(${mediaTransform.rotation})`}
          >
            <rect
              x={-placement.width / 2}
              y={-placement.height / 2}
              width={placement.width}
              height={placement.height}
              fill="none"
              stroke="#c6f36b"
              strokeWidth="1.8"
              vectorEffect="non-scaling-stroke"
              strokeDasharray="7 5"
            />
            {[
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ].map(([x, y], index) => (
              <rect
                key={index}
                data-media-handle={index}
                x={(x * placement.width) / 2 - 7}
                y={(y * placement.height) / 2 - 7}
                width="14"
                height="14"
                rx="2"
                fill="#c6f36b"
                stroke="#112319"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                style={{ cursor: index % 2 ? "nesw-resize" : "nwse-resize" }}
              />
            ))}
            <rect
              x="-62"
              y={-placement.height / 2 - 31}
              width="124"
              height="23"
              rx="4"
              fill="#111b1b"
            />
            <text
              x="0"
              y={-placement.height / 2 - 15}
              textAnchor="middle"
              fill="#d4eda8"
              fontSize="12"
              fontFamily="Arial,sans-serif"
            >
              DRAG TO POSITION
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
