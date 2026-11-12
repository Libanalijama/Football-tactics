import type {
  Keyframe,
  Player,
  Point,
  Scene,
  TacticalState,
  TeamSide,
} from "../types";
import { ballAtTime, clampPoint } from "./animation";
import { formationPositions } from "./formations";

export const PITCH_METRES = { length: 105, width: 68 } as const;
export type TacticalPreset = "low" | "mid" | "high" | "build-out";
export const attackDirection = (side: TeamSide) => (side === "home" ? 1 : -1);
export const distanceMeters = (a: Point, b: Point) =>
  Math.hypot((b.x - a.x) * 1.05, (b.y - a.y) * 0.68);

export function playerLine(player: Player): "GK" | "DEF" | "MID" | "FWD" {
  const role = player.role.trim().toUpperCase();
  if (/GOAL|^GK$|^G$/.test(role)) return "GK";
  if (/DEF|BACK|^D$|^[CLR]B$|^CB$|^[LR]WB$/.test(role)) return "DEF";
  if (/FWD|FORWARD|ATTACK|STRIK|^F$|^ST$|^CF$|^[LR]W$/.test(role)) return "FWD";
  return "MID";
}

export function tacticsForScene(
  scene: Scene,
  side: TeamSide = scene.tactics?.activeTeam ?? "home",
): TacticalState {
  return {
    showShape: false,
    showLines: false,
    showDistances: false,
    showTrails: false,
    showBall: false,
    ball: { x: 50, y: 50 },
    ...scene.tactics,
    ...(scene.tactics?.activeTeam === side
      ? {}
      : { lineGroups: undefined, formation: undefined, block: undefined }),
    activeTeam: side,
  };
}

function requirePitch(scene: Scene) {
  if (scene.background !== "pitch")
    throw new Error(
      "Team movements belong on the tactical pitch. Switch to Tactical board first.",
    );
}
function requirePlayer(scene: Scene, id: string): Player {
  const player = scene.players.find((p) => p.id === id && p.onPitch);
  if (!player) throw new Error("Select a player who is on the pitch.");
  return player;
}
function validMetres(metres: number) {
  if (!Number.isFinite(metres) || metres < 0 || metres > 105)
    throw new Error("Choose a distance between 0 and 105 metres.");
  return metres;
}
function snapshot(
  players: Player[],
  time: number,
  ball: Point & { carrierId?: string },
): Keyframe {
  return {
    id: crypto.randomUUID(),
    time,
    positions: Object.fromEntries(
      players.map((p) => [p.id, { x: p.x, y: p.y }]),
    ),
    ball: { x: ball.x, y: ball.y },
    ...(ball.carrierId ? { ballCarrierId: ball.carrierId } : {}),
  };
}

/** Each football action prepares a complete before/end movement, preserving the roster and source match. */
function animate(
  scene: Scene,
  side: TeamSide,
  players: Player[],
  duration: number,
  patch: Partial<TacticalState> = {},
): Scene {
  requirePitch(scene);
  if (!Number.isFinite(duration) || duration < 1 || duration > 30)
    throw new Error("Choose a movement duration between 1 and 30 seconds.");
  const tactics = {
    ...tacticsForScene(scene, side),
    block: "custom" as const,
    ...patch,
  };
  const startBall = ballAtTime({ ...scene, keyframes: [] }, 0);
  const next = { ...scene, players, tactics, duration };
  const endBall = ballAtTime({ ...next, keyframes: [] }, 0);
  return {
    ...next,
    keyframes: [
      snapshot(scene.players, 0, startBall),
      snapshot(players, duration, endBall),
    ],
  };
}

const PRESETS = {
  low: { keeper: 6, first: 18, last: 41, width: 38 },
  mid: { keeper: 10, first: 31, last: 58, width: 46 },
  high: { keeper: 23, first: 49, last: 80, width: 50 },
  "build-out": { keeper: 6, first: 20, last: 66, width: 56 },
} as const;

export function applyTacticalPreset(
  scene: Scene,
  side: TeamSide,
  preset: TacticalPreset,
  formation = "4-4-2",
  duration = 3,
): Scene {
  requirePitch(scene);
  formationPositions(formation, side); // shared validation: ten outfield players.
  const unit = scene.players.filter((p) => p.team === side && p.onPitch);
  if (!unit.length)
    throw new Error("Add players to this team before preparing a movement.");
  const direction = attackDirection(side),
    rank = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  const keeper =
    unit.find((p) => playerLine(p) === "GK") ??
    [...unit].sort((a, b) => direction * (a.x - b.x))[0];
  const outfield = unit
    .filter((p) => p.id !== keeper.id)
    .sort(
      (a, b) =>
        rank[playerLine(a)] - rank[playerLine(b)] ||
        a.y - b.y ||
        a.id.localeCompare(b.id),
    );
  const counts = formation.split("-").map(Number),
    setting = PRESETS[preset];
  const target = new Map<string, Point>();
  const lineGroups: string[][] = [];
  target.set(keeper.id, {
    x: side === "home" ? setting.keeper : 100 - setting.keeper,
    y: 50,
  });
  let offset = 0;
  counts.forEach((count, line) => {
    const members = outfield
      .slice(offset, offset + count)
      .sort((a, b) => a.y - b.y);
    offset += count;
    const depth =
      setting.first +
      ((setting.last - setting.first) * line) / Math.max(1, counts.length - 1);
    const width =
      (setting.width / 68) * 100 * (line === counts.length - 1 ? 0.72 : 1);
    lineGroups.push(members.map((p) => p.id));
    members.forEach((p, index) =>
      target.set(p.id, {
        x: side === "home" ? depth : 100 - depth,
        y:
          members.length === 1
            ? 50
            : 50 - width / 2 + (width * index) / (members.length - 1),
      }),
    );
  });
  const players = scene.players.map((p) =>
    target.has(p.id) ? { ...p, ...target.get(p.id)! } : p,
  );
  return animate(scene, side, players, duration, {
    formation,
    block: preset,
    lineGroups,
    showShape: true,
    showLines: true,
  });
}
export const createLowBlock = (
  scene: Scene,
  side: TeamSide,
  formation = "4-4-2",
  duration = 3,
) => applyTacticalPreset(scene, side, "low", formation, duration);
export const createMidBlock = (
  scene: Scene,
  side: TeamSide,
  formation = "4-4-2",
  duration = 3,
) => applyTacticalPreset(scene, side, "mid", formation, duration);
export const createHighPress = (
  scene: Scene,
  side: TeamSide,
  formation = "4-3-3",
  duration = 3,
) => applyTacticalPreset(scene, side, "high", formation, duration);
export const createBuildOut = (
  scene: Scene,
  side: TeamSide,
  formation = "4-3-3",
  duration = 3,
) => applyTacticalPreset(scene, side, "build-out", formation, duration);

/** Common outfield translation preserves line spacing. The goalkeeper adjusts at a shallower rate. */
function translateTeam(
  scene: Scene,
  side: TeamSide,
  dx: number,
  dy: number,
  duration: number,
): Scene {
  const unit = scene.players.filter((p) => p.onPitch && p.team === side),
    outfield = unit.filter((p) => playerLine(p) !== "GK");
  if (!unit.length)
    throw new Error("Add players to this team before preparing a movement.");
  const bounds = outfield.length ? outfield : unit;
  const actualX = Math.max(
    2 - Math.min(...bounds.map((p) => p.x)),
    Math.min(98 - Math.max(...bounds.map((p) => p.x)), dx),
  );
  const actualY = Math.max(
    4 - Math.min(...bounds.map((p) => p.y)),
    Math.min(96 - Math.max(...bounds.map((p) => p.y)), dy),
  );
  const players = scene.players.map((p) =>
    p.onPitch && p.team === side
      ? {
          ...p,
          ...clampPoint({
            x: p.x + actualX * (playerLine(p) === "GK" ? 0.45 : 1),
            y: p.y + actualY * (playerLine(p) === "GK" ? 0.3 : 1),
          }),
        }
      : p,
  );
  return animate(scene, side, players, duration, {
    showLines: true,
    showTrails: true,
  });
}
export function dropBack(
  scene: Scene,
  side: TeamSide,
  metres = 10,
  duration = 3,
): Scene {
  return translateTeam(
    scene,
    side,
    ((-attackDirection(side) * validMetres(metres)) / 105) * 100,
    0,
    duration,
  );
}
export function advanceTeam(
  scene: Scene,
  side: TeamSide,
  metres = 10,
  duration = 3,
): Scene {
  return translateTeam(
    scene,
    side,
    ((attackDirection(side) * validMetres(metres)) / 105) * 100,
    0,
    duration,
  );
}
export function shiftTeam(
  scene: Scene,
  side: TeamSide,
  direction: "left" | "right",
  metres = 5,
  duration = 3,
): Scene {
  return translateTeam(
    scene,
    side,
    0,
    (((direction === "left" ? -1 : 1) *
      attackDirection(side) *
      validMetres(metres)) /
      68) *
      100,
    duration,
  );
}
export function changeTeamWidth(
  scene: Scene,
  side: TeamSide,
  metres: number,
  duration = 3,
): Scene {
  if (!Number.isFinite(metres) || Math.abs(metres) > 40)
    throw new Error("Choose a width change between −40 and 40 metres.");
  const unit = scene.players.filter(
    (p) => p.onPitch && p.team === side && playerLine(p) !== "GK",
  );
  if (unit.length < 2)
    throw new Error(
      "Place at least two outfield players before changing team width.",
    );
  const min = Math.min(...unit.map((p) => p.y)),
    max = Math.max(...unit.map((p) => p.y)),
    center = (min + max) / 2;
  const span = Math.max(1, max - min),
    nextSpan = Math.min(90, Math.max(15, span + (metres / 68) * 100));
  const safeCenter = Math.max(
    5 + nextSpan / 2,
    Math.min(95 - nextSpan / 2, center),
  );
  return animate(
    scene,
    side,
    scene.players.map((p) =>
      unit.some((member) => member.id === p.id)
        ? { ...p, y: safeCenter + ((p.y - center) * nextSpan) / span }
        : p,
    ),
    duration,
    { showShape: true, showLines: true },
  );
}
export function runPlayer(
  scene: Scene,
  playerId: string,
  destination: Point,
  duration = 3,
): Scene {
  const player = requirePlayer(scene, playerId),
    point = clampPoint(destination);
  if (!Number.isFinite(destination.x) || !Number.isFinite(destination.y))
    throw new Error("Choose a valid destination on the pitch.");
  return animate(
    scene,
    player.team,
    scene.players.map((p) => (p.id === playerId ? { ...p, ...point } : p)),
    duration,
    { showTrails: true },
  );
}
export function carryBall(
  scene: Scene,
  playerId: string,
  destination: Point,
  duration = 3,
): Scene {
  const player = requirePlayer(scene, playerId);
  const attached = setBallCarrier(scene, playerId);
  return runPlayer(attached, player.id, destination, duration);
}
export function setBallCarrier(scene: Scene, playerId: string): Scene {
  requirePitch(scene);
  const player = requirePlayer(scene, playerId);
  const ball = { x: player.x, y: player.y, carrierId: player.id };
  return {
    ...scene,
    tactics: { ...tacticsForScene(scene, player.team), showBall: true, ball },
    keyframes: scene.keyframes.map((frame) => ({
      ...frame,
      ball: frame.positions[player.id] ?? { x: player.x, y: player.y },
      ballCarrierId: player.id,
    })),
  };
}
export function placeBall(scene: Scene, position: Point): Scene {
  requirePitch(scene);
  const ball = clampPoint(position);
  return {
    ...scene,
    tactics: { ...tacticsForScene(scene), showBall: true, ball },
    keyframes: scene.keyframes.map(({ ballCarrierId: _, ...frame }) => ({
      ...frame,
      ball,
    })),
  };
}
export function passBall(
  scene: Scene,
  receiverId: string,
  duration = 2,
): Scene {
  const receiver = requirePlayer(scene, receiverId);
  return animate(scene, receiver.team, scene.players, duration, {
    showBall: true,
    ball: { x: receiver.x, y: receiver.y, carrierId: receiver.id },
  });
}

export function teamLines(
  scene: Scene,
  players: Player[],
  side: TeamSide,
): Player[][] {
  const unit = players.filter(
    (p) => p.onPitch && p.team === side && playerLine(p) !== "GK",
  );
  if (scene.tactics?.activeTeam === side && scene.tactics.lineGroups?.length)
    return scene.tactics.lineGroups
      .map((group) =>
        group
          .map((id) => unit.find((p) => p.id === id))
          .filter((p): p is Player => Boolean(p))
          .sort((a, b) => a.y - b.y),
      )
      .filter((group) => group.length);
  return (["DEF", "MID", "FWD"] as const)
    .map((line) =>
      unit.filter((p) => playerLine(p) === line).sort((a, b) => a.y - b.y),
    )
    .filter((group) => group.length);
}
export function teamMeasures(
  players: Player[],
  side: TeamSide,
): { width: number; depth: number } {
  const unit = players.filter(
    (p) => p.onPitch && p.team === side && playerLine(p) !== "GK",
  );
  if (!unit.length) return { width: 0, depth: 0 };
  return {
    width:
      (Math.max(...unit.map((p) => p.y)) - Math.min(...unit.map((p) => p.y))) *
      0.68,
    depth:
      (Math.max(...unit.map((p) => p.x)) - Math.min(...unit.map((p) => p.x))) *
      1.05,
  };
}
export function convexHull(points: Point[]): Point[] {
  const unique = [
    ...new Map(
      points.map((p) => [`${p.x}:${p.y}`, { x: p.x, y: p.y }]),
    ).values(),
  ].sort((a, b) => a.x - b.x || a.y - b.y);
  if (unique.length < 3) return unique;
  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const lower: Point[] = [],
    upper: Point[] = [];
  for (const p of unique) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  for (const p of [...unique].reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
