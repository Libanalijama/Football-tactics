import { describe, it, expect } from "vitest";
import { createProject, removeDemoContent } from "../src/lib/defaults";
describe("clean new projects and existing user work", () => {
  it("starts with one empty analysis scene and no invented player names or benches", () => {
    const p = createProject();
    expect(p.scenes).toHaveLength(1);
    expect(p.scenes[0].annotations).toHaveLength(0);
    expect(p.scenes[0].notes).toBe("");
    expect(p.scenes[0].players).toHaveLength(22);
    expect(
      p.scenes[0].players.every(
        (player) => player.name === "" && player.onPitch,
      ),
    ).toBe(true);
  });
  it("preserves user-created unnamed substitutes and graphics during cleanup", () => {
    const p = createProject();
    p.scenes[0].players.push({
      ...p.scenes[0].players[0],
      id: "bench",
      onPitch: false,
      name: "",
    });
    p.scenes[0].annotations.push({
      id: "drawing",
      type: "arrow",
      points: [
        { x: 10, y: 20 },
        { x: 40, y: 50 },
      ],
      color: "#ffffff",
      width: 3,
    });
    const cleaned = removeDemoContent(p);
    expect(cleaned.scenes[0].players).toHaveLength(23);
    expect(cleaned.scenes[0].annotations).toHaveLength(1);
  });
  it("removes original demo names without mutating source data or real players", () => {
    const p = createProject();
    p.scenes[0].name = "The build-up";
    p.scenes[0].players[0].name = "Goalkeeper";
    p.scenes[0].players[1].name = "Player 2";
    p.scenes[0].players[2].name = "Jordan Smith";
    p.scenes[0].notes = "Custom presenter notes";
    const cleaned = removeDemoContent(p);
    expect(cleaned.scenes[0].name).toBe("Scene 1");
    expect(cleaned.scenes[0].players[0].name).toBe("");
    expect(cleaned.scenes[0].players[2].name).toBe("Jordan Smith");
    expect(cleaned.scenes[0].notes).toBe("Custom presenter notes");
    expect(p.scenes[0].players[0].name).toBe("Goalkeeper");
  });
});
