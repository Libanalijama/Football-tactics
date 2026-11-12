import type { Keyframe, Player, Point, Scene } from "../types";
export function playersAtTime(scene: Scene, time: number): Player[] {
  const frames = [...scene.keyframes].sort((a, b) => a.time - b.time);
  if (!frames.length) return scene.players;
  const t = Math.min(scene.duration, Math.max(0, time));
  const before = [...frames].reverse().find((f) => f.time <= t) ?? frames[0];
  const after = frames.find((f) => f.time >= t) ?? frames[frames.length - 1];
  const span = after.time - before.time;
  const linear = span ? Math.min(1, Math.max(0, (t - before.time) / span)) : 0;
  const mix = linear * linear * (3 - 2 * linear);
  return scene.players.map((p) => {
    const a = before.positions[p.id] ?? p,
      b = after.positions[p.id] ?? a;
    return { ...p, x: a.x + (b.x - a.x) * mix, y: a.y + (b.y - a.y) * mix };
  });
}
export const clampPoint = (p: { x: number; y: number }) => ({
  x: Math.max(1, Math.min(99, p.x)),
  y: Math.max(1, Math.min(99, p.y)),
});

/** The ball follows its carrier throughout a run; a pass interpolates independently. */
export function ballAtTime(
  scene: Scene,
  time: number,
  animatedPlayers?: Player[],
): Point & { carrierId?: string } {
  const players = animatedPlayers ?? playersAtTime(scene, time);
  const fallback = scene.tactics?.ball ?? { x: 50, y: 50 };
  const carrierPoint = (carrierId: string | undefined, point: Point) => {
    const carrier = carrierId
      ? players.find((p) => p.id === carrierId && p.onPitch)
      : undefined;
    return carrier
      ? { x: carrier.x, y: carrier.y, carrierId: carrier.id }
      : { x: point.x, y: point.y };
  };
  const frames = [...scene.keyframes].sort((a, b) => a.time - b.time);
  if (!frames.length) return carrierPoint(fallback.carrierId, fallback);
  const t = Math.min(
    scene.duration,
    Math.max(0, Number.isFinite(time) ? time : 0),
  );
  const before =
    [...frames].reverse().find((frame) => frame.time <= t) ?? frames[0];
  const after =
    frames.find((frame) => frame.time >= t) ?? frames[frames.length - 1];
  const ballInFrame = (frame: Keyframe) => {
    const carrierId =
      frame.ballCarrierId ?? (frame.ball ? undefined : fallback.carrierId);
    const validCarrier =
      carrierId && scene.players.some((p) => p.id === carrierId && p.onPitch)
        ? carrierId
        : undefined;
    const point = validCarrier
      ? (frame.positions[validCarrier] ?? fallback)
      : (frame.ball ?? fallback);
    return { x: point.x, y: point.y, carrierId: validCarrier };
  };
  const a = ballInFrame(before),
    b = ballInFrame(after);
  const linear =
    after.time === before.time
      ? 0
      : Math.min(
          1,
          Math.max(0, (t - before.time) / (after.time - before.time)),
        );
  if (a.carrierId && a.carrierId === b.carrierId)
    return carrierPoint(a.carrierId, a);
  if (linear === 0) return carrierPoint(a.carrierId, a);
  if (linear === 1) return carrierPoint(b.carrierId, b);
  const mix = linear * linear * (3 - 2 * linear);
  return { x: a.x + (b.x - a.x) * mix, y: a.y + (b.y - a.y) * mix };
}
