import type { Project, Scene, Player } from "../types";
import { formationPositions } from "./formations";
export const uid = () => crypto.randomUUID();
function roster(): Player[] {
  return (["home", "away"] as const).flatMap((team) => {
    const points = formationPositions("4-3-3", team);
    return Array.from({ length: 16 }, (_, i) => ({
      id: uid(),
      team,
      number: i + 1,
      name:
        i === 0
          ? "Goalkeeper"
          : i < 11
            ? `Player ${i + 1}`
            : `Substitute ${i - 10}`,
      role: i === 0 ? "GK" : i < 5 ? "DEF" : i < 8 ? "MID" : "FWD",
      onPitch: i < 11,
      ...(points[i] ?? { x: 50, y: 50 }),
    }));
  });
}
export function createScene(name = "Untitled scene"): Scene {
  return {
    id: uid(),
    name,
    subtitle: "Tactical analysis",
    players: roster(),
    annotations: [],
    keyframes: [],
    duration: 8,
    mediaTime: 0,
    background: "pitch",
    pitchTheme: "stadium",
    showNames: true,
    showNumbers: true,
    showGrid: false,
    camera: "full",
    notes: "",
  };
}
export function createProject(): Project {
  const base = createScene("The build-up");
  base.subtitle = "Creating the overload";
  base.notes = "Draw the press. Find the spare player. Explain the next pass.";
  // All starting players are explicitly manual placeholders, never a fabricated real lineup.
  base.annotations = [
    {
      id: uid(),
      type: "zone",
      points: [
        { x: 48, y: 18 },
        { x: 71, y: 81 },
      ],
      color: "#c6f36b",
      width: 2,
    },
    {
      id: uid(),
      type: "arrow",
      points: [
        { x: 34, y: 50 },
        { x: 57, y: 31 },
      ],
      color: "#c6f36b",
      width: 3,
    },
    {
      id: uid(),
      type: "pass",
      points: [
        { x: 23, y: 60 },
        { x: 49, y: 67 },
      ],
      color: "#ffffff",
      width: 2,
    },
  ];
  const second = structuredClone(base);
  second.id = uid();
  second.name = "Beat the press";
  second.subtitle = "Play through the lines";
  second.annotations = [];
  const third = structuredClone(base);
  third.id = uid();
  third.name = "The final third";
  third.subtitle = "Attack the space";
  third.annotations = [];
  return {
    version: 1,
    id: uid(),
    name: "Untitled match analysis",
    updatedAt: new Date().toISOString(),
    home: {
      name: "Home team",
      shortName: "HOME",
      color: "#ef654d",
      formation: "4-3-3",
    },
    away: {
      name: "Away team",
      shortName: "AWAY",
      color: "#81b6fa",
      formation: "4-3-3",
    },
    scenes: [base, second, third],
    activeSceneId: base.id,
    assets: [],
    badgesCleared: false,
  };
}
