import type { Player, Scene } from "../types";
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
