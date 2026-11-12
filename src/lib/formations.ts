import type { Player, Point, TeamSide } from "../types";
export const FORMATIONS = [
  "4-3-3",
  "4-2-3-1",
  "4-4-2",
  "3-4-3",
  "3-5-2",
  "5-3-2",
] as const;
export function formationPositions(formation: string, team: TeamSide): Point[] {
  const lines = formation.split("-").map(Number);
  if (
    lines.some((n) => !Number.isInteger(n) || n < 1 || n > 5) ||
    lines.reduce((a, b) => a + b, 0) !== 10
  )
    throw new Error("Formation must contain ten outfield players.");
  const result: Point[] = [{ x: 8, y: 50 }];
  lines.forEach((count, line) => {
    for (let i = 0; i < count; i++)
      result.push({
        x: 22 + line * (44 / Math.max(1, lines.length - 1)),
        y: (100 * (i + 1)) / (count + 1),
      });
  });
  return result.map((p) =>
    team === "away" ? { x: 100 - p.x, y: 100 - p.y } : p,
  );
}
export function applyFormation(
  players: Player[],
  formation: string,
  team: TeamSide,
): Player[] {
  const pos = formationPositions(formation, team);
  let index = 0;
  return players.map((p) =>
    p.team === team && p.onPitch
      ? { ...p, ...(pos[index++] ?? { x: 50, y: 50 }) }
      : p,
  );
}
