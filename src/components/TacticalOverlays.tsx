import { useId, useMemo } from "react";
import type { Player, Point, Scene, TeamSettings } from "../types";
import { ballAtTime } from "../lib/animation";
import {
  attackDirection,
  convexHull,
  distanceMeters,
  playerLine,
  teamLines,
  teamMeasures,
} from "../lib/football-actions";

export interface TacticalOverlaysProps {
  scene: Scene;
  players: Player[];
  home: TeamSettings;
  away: TeamSettings;
  time?: number;
  selectedPlayerId?: string | null;
}
// The shared board view uses a 1140×720 playing area, inset 30 units on each side.
const px = (p: Point) => ({ x: 30 + p.x * 11.4, y: 30 + p.y * 7.2 });
const coordinates = (points: Point[]) =>
  points
    .map((p) => {
      const q = px(p);
      return `${q.x.toFixed(2)},${q.y.toFixed(2)}`;
    })
    .join(" ");
function MetricLabel({ point, text }: { point: Point; text: string }) {
  const p = px(point),
    width = text.length * 7.8 + 16;
  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      <rect
        x={-width / 2}
        y="-12"
        width={width}
        height="23"
        rx="5"
        fill="#101d20"
        fillOpacity=".93"
        stroke="#d5e3d2"
        strokeOpacity=".2"
      />
      <text
        y="4"
        textAnchor="middle"
        fill="#e8f2e5"
        fontFamily="Arial, sans-serif"
        fontSize="12"
        fontWeight="600"
      >
        {text}
      </text>
    </g>
  );
}

export function TacticalOverlays({
  scene,
  players,
  home,
  away,
  time = 0,
  selectedPlayerId,
}: TacticalOverlaysProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, ""),
    tactics = scene.tactics;
  const activeSide = tactics?.activeTeam;
  const trails = useMemo(() => {
    if (!activeSide) return [];
    const frames = [...scene.keyframes].sort((a, b) => a.time - b.time);
    return scene.players
      .filter(
        (p) => p.onPitch && p.team === activeSide && playerLine(p) !== "GK",
      )
      .map((player) => {
        const points = frames
          .map((frame) => frame.positions[player.id])
          .filter((point): point is Point => Boolean(point));
        const travel = points
          .slice(1)
          .reduce(
            (sum, point, index) => sum + distanceMeters(points[index], point),
            0,
          );
        return { id: player.id, points, travel };
      })
      .filter((trail) => trail.points.length > 1 && trail.travel > 0.3);
  }, [scene.keyframes, scene.players, activeSide]);
  if (!tactics) return null;
  const side = tactics.activeTeam,
    color = side === "home" ? home.color : away.color;
  const unit = players.filter(
    (p) => p.onPitch && p.team === side && playerLine(p) !== "GK",
  );
  const hull = convexHull(unit),
    lines = teamLines(scene, players, side),
    measure = teamMeasures(players, side);
  const opposition = players.filter(
    (p) => p.onPitch && p.team !== side && playerLine(p) !== "GK",
  );
  const oppositionHull = convexHull(opposition),
    oppositionColor = side === "home" ? away.color : home.color;
  const marker = `${id}-run-arrow`,
    selected = players.find(
      (p) => p.id === selectedPlayerId && p.onPitch && p.team === side,
    );
  const nearest = selected
    ? unit
        .filter((p) => p.id !== selected.id)
        .sort(
          (a, b) => distanceMeters(selected, a) - distanceMeters(selected, b),
        )
        .slice(0, 2)
    : [];
  const minX = unit.length ? Math.min(...unit.map((p) => p.x)) : 0,
    maxX = unit.length ? Math.max(...unit.map((p) => p.x)) : 0;
  const minY = unit.length ? Math.min(...unit.map((p) => p.y)) : 0,
    maxY = unit.length ? Math.max(...unit.map((p) => p.y)) : 0;
  const ball = ballAtTime(scene, time, players),
    carrier = ball.carrierId
      ? players.find((p) => p.id === ball.carrierId)
      : undefined;
  const ballPoint = px(
    carrier
      ? {
          x: Math.max(
            1,
            Math.min(99, ball.x + attackDirection(carrier.team) * 2.3),
          ),
          y: Math.max(1, Math.min(99, ball.y + 1.3)),
        }
      : ball,
  );
  return (
    <g className="tactical-overlays" pointerEvents="none">
      <defs>
        <marker
          id={marker}
          markerWidth="10"
          markerHeight="8"
          refX="8"
          refY="4"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 0 L 10 4 L 0 8 Z" fill={color} />
        </marker>
      </defs>
      {tactics.showShape && oppositionHull.length >= 3 && (
        <polygon
          data-testid="opposition-shape"
          points={coordinates(oppositionHull)}
          fill={oppositionColor}
          fillOpacity=".035"
          stroke={oppositionColor}
          strokeOpacity=".25"
          strokeWidth="1.4"
        />
      )}
      {tactics.showShape && hull.length >= 3 && (
        <polygon
          data-testid="team-shape"
          points={coordinates(hull)}
          fill={color}
          fillOpacity=".09"
          stroke={color}
          strokeOpacity=".45"
          strokeWidth="1.7"
        />
      )}
      {tactics.showTrails &&
        trails.map((trail) => (
          <polyline
            data-testid="running-trail"
            key={trail.id}
            points={coordinates(trail.points)}
            fill="none"
            stroke={color}
            strokeWidth="2.3"
            strokeOpacity=".75"
            strokeDasharray="5 5"
            markerEnd={`url(#${marker})`}
          />
        ))}
      {tactics.showLines &&
        lines.map((line, index) =>
          line.length >= 2 ? (
            <polyline
              data-testid="defensive-line"
              key={line.map((p) => p.id).join("-")}
              points={coordinates(line)}
              fill="none"
              stroke={color}
              strokeWidth={index === 0 ? 3 : 2}
              strokeOpacity={index === 0 ? 0.88 : 0.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null,
        )}
      {tactics.showDistances && unit.length > 1 && (
        <g data-testid="team-distances">
          <g
            stroke="#e8f2e5"
            strokeOpacity=".5"
            strokeWidth="1.2"
            strokeDasharray="4 4"
          >
            <line
              x1={px({ x: minX, y: Math.min(96, maxY + 5) }).x}
              x2={px({ x: maxX, y: Math.min(96, maxY + 5) }).x}
              y1={px({ x: 0, y: Math.min(96, maxY + 5) }).y}
              y2={px({ x: 0, y: Math.min(96, maxY + 5) }).y}
            />
            <line
              x1={px({ x: Math.min(96, maxX + 5), y: 0 }).x}
              x2={px({ x: Math.min(96, maxX + 5), y: 0 }).x}
              y1={px({ x: 0, y: minY }).y}
              y2={px({ x: 0, y: maxY }).y}
            />
          </g>
          <MetricLabel
            point={{ x: (minX + maxX) / 2, y: Math.min(96, maxY + 5) }}
            text={`${measure.depth.toFixed(1)} m deep`}
          />
          <MetricLabel
            point={{ x: Math.min(93, maxX + 7), y: (minY + maxY) / 2 }}
            text={`${measure.width.toFixed(1)} m wide`}
          />
          {(selected
            ? nearest.map((player) => ({ a: selected, b: player }))
            : (lines[0] ?? [])
                .slice(1)
                .map((player, index) => ({ a: lines[0][index], b: player }))
          ).map(({ a, b }) => (
            <g key={`${a.id}-${b.id}`}>
              <line
                x1={px(a).x}
                y1={px(a).y}
                x2={px(b).x}
                y2={px(b).y}
                stroke="#f4f7df"
                strokeOpacity=".6"
                strokeDasharray="3 5"
                strokeWidth="1.5"
              />
              <MetricLabel
                point={{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }}
                text={`${distanceMeters(a, b).toFixed(1)} m`}
              />
            </g>
          ))}
        </g>
      )}
      {tactics.showBall && (
        <g
          data-testid="tactical-ball"
          data-carrier-id={ball.carrierId}
          transform={`translate(${ballPoint.x} ${ballPoint.y})`}
        >
          <ellipse cy="7" rx="9" ry="3" fill="#000" opacity=".24" />
          <circle r="7.5" fill="#f6f9f2" stroke="#112324" strokeWidth="1.4" />
          <path d="M 0 -3.5 L 3.5 -1 L 2 3 L -2 3 L -3.5 -1 Z" fill="#1e2c2d" />
          <path
            d="M 0 -3.5 V -7 M 3.5 -1 L 7 -2 M 2 3 L 4.5 6 M -2 3 L -4.5 6 M -3.5 -1 L -7 -2"
            fill="none"
            stroke="#334343"
            strokeWidth=".8"
          />
        </g>
      )}
    </g>
  );
}
