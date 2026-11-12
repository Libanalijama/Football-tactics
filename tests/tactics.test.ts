import { describe, expect, it } from "vitest";
import {
  applyFormation,
  FORMATIONS,
  formationPositions,
} from "../src/lib/formations";
import { playersAtTime } from "../src/lib/animation";
import { createProject } from "../src/lib/defaults";

describe("formation engine", () => {
  for (const formation of FORMATIONS) {
    it(`places eleven mirrored players in a ${formation}`, () => {
      const home = formationPositions(formation, "home"),
        away = formationPositions(formation, "away");
      expect(home).toHaveLength(11);
      expect(away).toHaveLength(11);
      expect(new Set(home.map((point) => `${point.x},${point.y}`)).size).toBe(
        11,
      );
      home.forEach((point, index) => {
        expect(point.x).toBeGreaterThan(0);
        expect(point.x).toBeLessThan(100);
        expect(point.y).toBeGreaterThan(0);
        expect(point.y).toBeLessThan(100);
        expect(away[index].x + point.x).toBeCloseTo(100);
        expect(away[index].y + point.y).toBeCloseTo(100);
      });
    });
  }
  it("rejects invalid formations without inventing an eleventh outfield player", () => {
    for (const formation of [
      "4-4-3",
      "4-3",
      "0-5-5",
      "4-2.5-3.5",
      "four-four-two",
      "-4-3-3",
    ]) {
      expect(() => formationPositions(formation, "home")).toThrow();
    }
  });
  it("leaves the opposition, substitutes and source roster untouched", () => {
    const project = createProject(),
      original = structuredClone(project.scenes[0].players);
    const result = applyFormation(project.scenes[0].players, "3-5-2", "home");
    expect(project.scenes[0].players).toEqual(original);
    result
      .filter((p) => p.team === "away" || !p.onPitch)
      .forEach((p) =>
        expect(p).toEqual(original.find((item) => item.id === p.id)),
      );
    result
      .filter((p) => p.team === "home" && p.onPitch)
      .forEach((p) => {
        const before = original.find((item) => item.id === p.id)!;
        expect({ ...p, x: before.x, y: before.y }).toEqual(before);
      });
  });
});

describe("tactical animation", () => {
  it("plays sorted keyframes, clamps time and preserves identities without modifying saved scenes", () => {
    const scene = createProject().scenes[0],
      player = scene.players[0];
    scene.keyframes = [
      { id: "end", time: 8, positions: { [player.id]: { x: 90, y: 80 } } },
      { id: "start", time: 0, positions: { [player.id]: { x: 10, y: 20 } } },
    ];
    const original = structuredClone(scene);
    const start = playersAtTime(scene, -100).find((p) => p.id === player.id)!;
    const halfway = playersAtTime(scene, 4).find((p) => p.id === player.id)!;
    const end = playersAtTime(scene, 100).find((p) => p.id === player.id)!;
    expect({ x: start.x, y: start.y }).toEqual({ x: 10, y: 20 });
    expect({ x: halfway.x, y: halfway.y }).toEqual({ x: 50, y: 50 });
    expect({ x: end.x, y: end.y }).toEqual({ x: 90, y: 80 });
    expect(halfway.name).toBe(player.name);
    expect(halfway.number).toBe(player.number);
    expect(scene).toEqual(original);
    expect(
      playersAtTime(scene, 4).find((p) => p.id === scene.players[1].id),
    ).toEqual(scene.players[1]);
  });
  it("uses static positions when there are no keyframes", () => {
    const scene = createProject().scenes[0];
    expect(playersAtTime(scene, 3)).toEqual(scene.players);
  });
  it("does not divide by zero when a scene has one keyframe", () => {
    const scene = createProject().scenes[0],
      player = scene.players[0];
    scene.keyframes = [
      { id: "only", time: 2, positions: { [player.id]: { x: 25, y: 75 } } },
    ];
    for (const time of [0, 2, 8]) {
      const result = playersAtTime(scene, time)[0];
      expect(result.x).toBe(25);
      expect(result.y).toBe(75);
    }
  });
});
