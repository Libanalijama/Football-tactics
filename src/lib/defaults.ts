import type { Project, Scene, Player } from "../types";
import { formationPositions } from "./formations";
export const uid = () => crypto.randomUUID();
function roster(): Player[] {
  return (["home", "away"] as const).flatMap((team) =>
    formationPositions("4-3-3", team).map((point, i) => ({
      id: uid(),
      team,
      number: i + 1,
      name: "",
      role: i === 0 ? "GK" : i < 5 ? "DEF" : i < 8 ? "MID" : "FWD",
      onPitch: true,
      ...point,
    })),
  );
}
export function createScene(name = "Scene 1"): Scene {
  return {
    id: uid(),
    name,
    subtitle: "",
    players: roster(),
    annotations: [],
    keyframes: [],
    duration: 8,
    mediaTime: 0,
    background: "pitch",
    pitchTheme: "stadium",
    showNames: false,
    showNumbers: true,
    showGrid: false,
    camera: "full",
    notes: "",
  };
}
export function createProject(): Project {
  const scene = createScene();
  return {
    version: 1,
    id: uid(),
    name: "Match analysis",
    updatedAt: new Date().toISOString(),
    home: {
      name: "Home",
      shortName: "HOME",
      color: "#ef654d",
      formation: "4-3-3",
    },
    away: {
      name: "Away",
      shortName: "AWAY",
      color: "#81b6fa",
      formation: "4-3-3",
    },
    scenes: [scene],
    activeSceneId: scene.id,
    assets: [],
    badgesCleared: false,
  };
}
export function removeDemoContent(project: Project): Project {
  const next = structuredClone(project);
  if (next.name === "Untitled match analysis") next.name = "Match analysis";
  for (const [index, scene] of next.scenes.entries()) {
    const demoScene =
      ["The build-up", "Beat the press", "The final third"].includes(
        scene.name,
      ) && !scene.sourceMatchId;
    scene.players = scene.players
      .filter((p) => !(!p.onPitch && /^Substitute \d+$/.test(p.name)))
      .map((p) => ({
        ...p,
        name:
          /^Player \d+$|^Substitute \d+$|^New player$/.test(p.name) ||
          p.name === "Goalkeeper"
            ? ""
            : p.name,
      }));
    if (demoScene) {
      scene.name = "Scene " + (index + 1);
      if (
        [
          "Creating the overload",
          "Play through the lines",
          "Attack the space",
        ].includes(scene.subtitle)
      )
        scene.subtitle = "";
      scene.annotations = scene.annotations.filter(
        (a) =>
          !(
            (a.type === "zone" &&
              a.points[0]?.x === 48 &&
              a.points[0]?.y === 18 &&
              a.points[1]?.x === 71 &&
              a.points[1]?.y === 81) ||
            (a.type === "arrow" &&
              a.points[0]?.x === 34 &&
              a.points[0]?.y === 50 &&
              a.points[1]?.x === 57 &&
              a.points[1]?.y === 31) ||
            (a.type === "pass" &&
              a.points[0]?.x === 23 &&
              a.points[0]?.y === 60 &&
              a.points[1]?.x === 49 &&
              a.points[1]?.y === 67)
          ),
      );
    }
    if (
      scene.notes ===
      "Draw the press. Find the spare player. Explain the next pass."
    )
      scene.notes = "";
  }
  return next;
}
