import { describe, expect, it } from "vitest";
import type {
  OfficialLineup,
  OfficialMatch,
  OfficialPlayer,
} from "../src/types";
import { createProject, createScene } from "../src/lib/defaults";
import { importOfficialMatch } from "../src/lib/match-import";
import { validateProject } from "../src/lib/validation";

function officialPlayer(index: number, side: "home" | "away"): OfficialPlayer {
  return {
    id: `test-provider:${side}:${index}`,
    name: `${side} test player ${index}`,
    number: index === 1 ? null : index,
    position: index === 1 ? "GK" : "MID",
  };
}
function lineup(side: "home" | "away", substitutes = 5): OfficialLineup {
  return {
    teamId: `test-provider:${side}`,
    status: "provider-reported",
    formation: "4-3-3",
    starters: Array.from({ length: 11 }, (_, i) => officialPlayer(i + 1, side)),
    substitutes: Array.from({ length: substitutes }, (_, i) =>
      officialPlayer(i + 12, side),
    ),
  };
}
function match(lineups: OfficialLineup[] = []): OfficialMatch {
  return {
    id: "test-provider:match",
    provider: "contract-test",
    retrievedAt: "2026-11-12T20:00:00.000Z",
    kickoff: "2026-11-12T20:00:00.000Z",
    competition: "Contract Test Competition",
    season: "2026",
    venue: null,
    status: "NS",
    home: { id: "test-provider:home", name: "Test Home", shortName: "THM" },
    away: { id: "test-provider:away", name: "Test Away", shortName: "TAW" },
    score: { home: null, away: null },
    lineups,
    events: [],
  };
}

describe("official match import", () => {
  it("clears manual placeholders for unavailable sheets and removes media state", () => {
    const project = createProject();
    const scene = project.scenes[0];
    scene.background = "media";
    scene.mediaId = "test-media";
    scene.mediaTime = 42;
    scene.keyframes = [{ id: "test-frame", time: 0, positions: {} }];
    project.assets = [
      {
        id: "test-media",
        name: "test.png",
        kind: "image",
        mime: "image/png",
        size: 1,
      },
    ];
    const result = importOfficialMatch(project, scene, match());
    const imported = result.scenes[0];
    expect(imported.players).toEqual([]);
    expect(imported.background).toBe("pitch");
    expect(imported).not.toHaveProperty("mediaId");
    expect(imported.mediaTime).toBe(0);
    expect(imported.keyframes).toEqual([]);
    expect(imported.annotations).toEqual([]);
    expect(imported.notes).toBe(scene.notes);
    expect(result.assets).toEqual(project.assets);
    expect(validateProject(result)).toEqual(result);
  });

  it("does not retain the missing side's former XI or use unavailable entries", () => {
    const project = createProject();
    const missingAway = { ...lineup("away"), status: "unavailable" as const };
    const result = importOfficialMatch(
      project,
      project.scenes[0],
      match([lineup("home"), missingAway]),
    );
    expect(
      result.scenes[0].players.filter((player) => player.team === "home"),
    ).toHaveLength(16);
    expect(
      result.scenes[0].players.filter((player) => player.team === "away"),
    ).toEqual([]);
    expect(result.officialMatch!.lineups[1]).toEqual(missingAway);
  });

  it("creates distinct editable players and preserves null official shirt numbers", () => {
    const project = createProject();
    const source = match([lineup("home"), lineup("away")]);
    const result = importOfficialMatch(project, project.scenes[0], source);
    const players = result.scenes[0].players;
    expect(players.filter((player) => player.onPitch)).toHaveLength(22);
    expect(players.filter((player) => !player.onPitch)).toHaveLength(10);
    expect(players[0]).toMatchObject({
      number: 0,
      name: "home test player 1",
      role: "GK",
      onPitch: true,
    });
    expect(players[0].id).not.toBe(source.lineups[0].starters[0].id);
    expect(result.officialMatch!.lineups[0].starters[0].number).toBeNull();
    expect(result.officialMatch!.lineups[0].status).toBe("provider-reported");
    expect(result.scenes[0].showNames).toBe(true);
    expect(new Set(players.map((player) => player.id)).size).toBe(
      players.length,
    );
  });

  it("keeps provider facts immutable through later tactical edits", () => {
    const project = createProject();
    project.scenes.push(createScene("Second scene"));
    const source = match([lineup("home"), lineup("away")]);
    const originalProject = structuredClone(project);
    const originalMatch = structuredClone(source);
    const result = importOfficialMatch(project, project.scenes[0], source);
    result.scenes[0].players[0].name = "Editorial tactical name";
    result.scenes[0].players[0].number = 99;
    result.scenes[0].players[0].x = 90;
    expect(result.officialMatch).toEqual(originalMatch);
    expect(source).toEqual(originalMatch);
    expect(project).toEqual(originalProject);
    result.officialMatch!.home.name = "Detached snapshot edit";
    expect(source).toEqual(originalMatch);
    expect(result.scenes[1]).toEqual(project.scenes[1]);
    expect(result.scenes[1]).not.toBe(project.scenes[1]);
  });

  it("caps the tactical roster at eighty without truncating official benches", () => {
    const project = createProject();
    const source = match([lineup("home", 40), lineup("away", 40)]);
    const result = importOfficialMatch(project, project.scenes[0], source);
    const players = result.scenes[0].players;
    expect(players).toHaveLength(80);
    for (const side of ["home", "away"]) {
      expect(
        players.filter((player) => player.team === side && player.onPitch),
      ).toHaveLength(11);
      expect(
        players.filter((player) => player.team === side && !player.onPitch),
      ).toHaveLength(29);
    }
    expect(
      result.officialMatch!.lineups.map((sheet) => sheet.substitutes.length),
    ).toEqual([40, 40]);
    expect(validateProject(result)).toEqual(result);
  });

  it("uses valid tactical positioning while preserving unknown provider formations", () => {
    const project = createProject();
    const source = match([
      { ...lineup("home"), formation: "4-2-3-1" },
      { ...lineup("away"), formation: "unavailable" },
    ]);
    const result = importOfficialMatch(project, project.scenes[0], source);
    expect(result.home.formation).toBe("4-2-3-1");
    expect(result.away.formation).toBe("4-3-3");
    expect(result.officialMatch!.lineups[1].formation).toBe("unavailable");
    expect(
      result.scenes[0].players.find((player) => player.team === "home")!.x,
    ).toBe(8);
    expect(
      result.scenes[0].players.find((player) => player.team === "away")!.x,
    ).toBe(92);
  });

  it("removes stale badges and copies only supplied ones", () => {
    const project = createProject();
    project.home.badge = "https://example.com/old-home.png";
    project.away.badge = "https://example.com/old-away.png";
    const source = match();
    source.home.badge = "https://example.com/rights-cleared-home.png";
    const result = importOfficialMatch(project, project.scenes[0], source);
    expect(result.home.badge).toBe(source.home.badge);
    expect(result.away).not.toHaveProperty("badge");
    expect(result.badgesCleared).toBe(false);
    expect(result.officialMatch).toEqual(source);
  });

  it("is deterministic, preserves other scenes and rejects an unknown target", () => {
    const project = createProject();
    project.scenes.push(
      createScene("Second scene"),
      createScene("Third scene"),
    );
    const source = match([lineup("home")]);
    const first = importOfficialMatch(project, project.scenes[1], source);
    const second = importOfficialMatch(project, project.scenes[1], source);
    expect(first).toEqual(second);
    expect(first.scenes[0]).toEqual(project.scenes[0]);
    expect(first.scenes[2]).toEqual(project.scenes[2]);
    expect(first.activeSceneId).toBe(project.scenes[1].id);
    expect(() =>
      importOfficialMatch(
        project,
        { ...project.scenes[0], id: "missing-scene" },
        source,
      ),
    ).toThrow("not in this project");
  });
});
