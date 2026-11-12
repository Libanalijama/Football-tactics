import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createProject } from "../src/lib/defaults";
import { ballAtTime, playersAtTime } from "../src/lib/animation";
import {
  advanceTeam,
  carryBall,
  changeTeamWidth,
  convexHull,
  createBuildOut,
  createHighPress,
  createLowBlock,
  createMidBlock,
  distanceMeters,
  dropBack,
  passBall,
  setBallCarrier,
  shiftTeam,
  teamMeasures,
} from "../src/lib/football-actions";
import { validateProject } from "../src/lib/validation";
import { TacticalOverlays } from "../src/components/TacticalOverlays";

describe("football actions", () => {
  it("prepares a narrow 4-4-2 low block with a complete before/end movement", () => {
    const scene = createProject().scenes[0];
    scene.sourceMatchId = "official-match";
    const original = structuredClone(scene),
      next = createLowBlock(scene, "home");
    const outfield = next.players.filter(
      (p) => p.team === "home" && p.role !== "GK",
    );
    expect(next.tactics?.lineGroups?.map((group) => group.length)).toEqual([
      4, 4, 2,
    ]);
    expect(Math.max(...outfield.map((p) => p.x))).toBeLessThanOrEqual(41);
    expect(Math.min(...outfield.map((p) => p.x))).toBeGreaterThanOrEqual(18);
    expect(teamMeasures(next.players, "home").width).toBeCloseTo(38);
    expect(next.keyframes.map((frame) => frame.time)).toEqual([0, 3]);
    expect(next.keyframes[0].positions[scene.players[1].id]).toEqual({
      x: scene.players[1].x,
      y: scene.players[1].y,
    });
    expect(next.keyframes[1].positions[scene.players[1].id]).toEqual({
      x: next.players[1].x,
      y: next.players[1].y,
    });
    expect(next.sourceMatchId).toBe("official-match");
    expect(scene).toEqual(original);
    expect(next.players.filter((p) => p.team === "away")).toEqual(
      scene.players.filter((p) => p.team === "away"),
    );
    next.players.forEach((p, index) =>
      expect({
        ...p,
        x: scene.players[index].x,
        y: scene.players[index].y,
      }).toEqual(scene.players[index]),
    );
  });
  it("mirrors defensive blocks for the opposite attacking direction", () => {
    const scene = createProject().scenes[0];
    const home = createLowBlock(scene, "home").players.filter(
      (p) => p.team === "home",
    );
    const away = createLowBlock(scene, "away").players.filter(
      (p) => p.team === "away",
    );
    const coordinates = (players: typeof home) =>
      players.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).sort();
    expect(
      coordinates(away.map((p) => ({ ...p, x: 100 - p.x, y: 100 - p.y }))),
    ).toEqual(coordinates(home));
  });
  it("offers distinct mid block, high press and build-out targets", () => {
    const scene = createProject().scenes[0];
    const low = createLowBlock(scene, "home"),
      mid = createMidBlock(scene, "home"),
      high = createHighPress(scene, "home"),
      build = createBuildOut(scene, "home");
    const max = (next: typeof scene) =>
      Math.max(
        ...next.players.filter((p) => p.team === "home").map((p) => p.x),
      );
    expect(max(low)).toBeLessThan(max(mid));
    expect(max(mid)).toBeLessThan(max(high));
    expect(teamMeasures(build.players, "home").width).toBeGreaterThan(
      teamMeasures(low.players, "home").width,
    );
    expect(high.tactics?.lineGroups?.map((group) => group.length)).toEqual([
      4, 3, 3,
    ]);
  });
  it("drops the unit by the requested physical distance and preserves its spacing", () => {
    const scene = createLowBlock(createProject().scenes[0], "home"),
      next = dropBack(scene, "home", 10);
    const unit = scene.players.filter(
      (p) => p.team === "home" && p.role !== "GK",
    );
    for (const player of unit) {
      const moved = next.players.find((p) => p.id === player.id)!;
      expect(distanceMeters(player, moved)).toBeCloseTo(10);
      expect(moved.x).toBeLessThan(player.x);
    }
    expect(teamMeasures(next.players, "home")).toEqual(
      teamMeasures(scene.players, "home"),
    );
    expect(next.players.filter((p) => p.team === "away")).toEqual(
      scene.players.filter((p) => p.team === "away"),
    );
    const away = dropBack(scene, "away", 5);
    expect(
      away.players.find((p) => p.team === "away" && p.role === "DEF")!.x,
    ).toBeGreaterThan(
      scene.players.find((p) => p.team === "away" && p.role === "DEF")!.x,
    );
  });
  it("clamps a whole unit at the pitch edge without distorting its lines", () => {
    const scene = createLowBlock(createProject().scenes[0], "home"),
      next = dropBack(scene, "home", 100);
    const unit = next.players.filter(
      (p) => p.team === "home" && p.role !== "GK",
    );
    expect(Math.min(...unit.map((p) => p.x))).toBeCloseTo(2);
    expect(teamMeasures(next.players, "home").depth).toBeCloseTo(
      teamMeasures(scene.players, "home").depth,
    );
    next.players.forEach((p) => {
      expect(p.x).toBeGreaterThanOrEqual(1);
      expect(p.x).toBeLessThanOrEqual(99);
      expect(p.y).toBeGreaterThanOrEqual(1);
      expect(p.y).toBeLessThanOrEqual(99);
    });
  });
  it("shifts left relative to each team and advances towards the opposing goal", () => {
    const scene = createProject().scenes[0],
      home = scene.players.find((p) => p.team === "home" && p.role === "MID")!,
      away = scene.players.find((p) => p.team === "away" && p.role === "MID")!;
    expect(
      shiftTeam(scene, "home", "left", 5).players.find((p) => p.id === home.id)!
        .y,
    ).toBeLessThan(home.y);
    expect(
      shiftTeam(scene, "away", "left", 5).players.find((p) => p.id === away.id)!
        .y,
    ).toBeGreaterThan(away.y);
    expect(
      advanceTeam(scene, "away", 5).players.find((p) => p.id === away.id)!.x,
    ).toBeLessThan(away.x);
  });
  it("changes unit width in metres while keeping the opponents untouched", () => {
    const scene = createLowBlock(createProject().scenes[0], "home"),
      narrow = changeTeamWidth(scene, "home", -5),
      wide = changeTeamWidth(scene, "home", 5);
    expect(teamMeasures(narrow.players, "home").width).toBeCloseTo(33);
    expect(teamMeasures(wide.players, "home").width).toBeCloseTo(43);
    expect(narrow.players.filter((p) => p.team === "away")).toEqual(
      scene.players.filter((p) => p.team === "away"),
    );
  });
  it("keeps the ball attached throughout a carrying run, including interpolation", () => {
    const scene = createProject().scenes[0],
      carrier = scene.players.find(
        (p) => p.team === "home" && p.role === "MID",
      )!;
    const next = carryBall(scene, carrier.id, {
      x: carrier.x + 15,
      y: carrier.y + 4,
    });
    for (const time of [0, 0.5, 1.5, 3]) {
      const player = playersAtTime(next, time).find(
        (p) => p.id === carrier.id,
      )!;
      expect(ballAtTime(next, time)).toEqual({
        x: player.x,
        y: player.y,
        carrierId: player.id,
      });
    }
    expect(
      next.keyframes.every((frame) => frame.ballCarrierId === carrier.id),
    ).toBe(true);
    expect(next.tactics?.showTrails).toBe(true);
  });
  it("animates a pass independently between carriers and attaches on arrival", () => {
    const scene = createProject().scenes[0],
      from = scene.players[5],
      to = scene.players[9];
    const next = passBall(setBallCarrier(scene, from.id), to.id, 2),
      mid = ballAtTime(next, 1);
    expect(ballAtTime(next, 0).carrierId).toBe(from.id);
    expect(mid.carrierId).toBeUndefined();
    expect(distanceMeters(mid, from)).toBeGreaterThan(0);
    expect(distanceMeters(mid, to)).toBeGreaterThan(0);
    expect(ballAtTime(next, 2)).toEqual({ x: to.x, y: to.y, carrierId: to.id });
  });
  it("does not invent players or move substitutes, and rejects invalid actions", () => {
    const scene = createProject().scenes[0],
      bench = {
        ...scene.players[2],
        id: "bench-player",
        onPitch: false,
        x: 50,
        y: 50,
      };
    scene.players.push(bench);
    const next = createLowBlock(scene, "home");
    expect(next.players).toHaveLength(scene.players.length);
    expect(next.players.find((p) => p.id === bench.id)).toEqual(bench);
    expect(() => setBallCarrier(scene, "unknown")).toThrow();
    expect(() => setBallCarrier(scene, bench.id)).toThrow();
    expect(() => dropBack(scene, "home", NaN)).toThrow();
    expect(() =>
      createLowBlock({ ...scene, background: "media" }, "home"),
    ).toThrow();
  });
  it("measures the physical pitch axes and computes a hull without interior points", () => {
    expect(distanceMeters({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(105);
    expect(distanceMeters({ x: 0, y: 0 }, { x: 0, y: 100 })).toBe(68);
    const points = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
        { x: 50, y: 50 },
      ],
      original = structuredClone(points);
    expect(convexHull(points)).toHaveLength(4);
    expect(points).toEqual(original);
  });
  it("persists complete tactical state and rejects unknown carrier references", () => {
    const project = createProject(),
      carrier = project.scenes[0].players[5];
    project.scenes[0] = carryBall(
      createLowBlock(project.scenes[0], "home"),
      carrier.id,
      { x: 50, y: 40 },
    );
    expect(validateProject(project).scenes[0].tactics?.ball.carrierId).toBe(
      carrier.id,
    );
    project.scenes[0].tactics!.ball.carrierId = "unknown";
    expect(() => validateProject(project)).toThrow();
  });
  it("renders both team shapes and the moving unit graphics in programme output", () => {
    const project = createProject(),
      scene = createLowBlock(project.scenes[0], "home");
    scene.tactics!.showDistances = true;
    scene.tactics!.showBall = true;
    const html = renderToStaticMarkup(
      createElement(TacticalOverlays, {
        scene,
        players: playersAtTime(scene, 3),
        home: project.home,
        away: project.away,
        time: 3,
      }),
    );
    expect(html).toContain('data-testid="team-shape"');
    expect(html).toContain('data-testid="opposition-shape"');
    expect(html.match(/data-testid="defensive-line"/g)).toHaveLength(3);
    expect(html).toContain("38.0 m wide");
    expect(html).toContain('data-testid="tactical-ball"');
  });
});
