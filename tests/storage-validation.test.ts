import { describe, it, expect } from "vitest";
import { createProject } from "../src/lib/defaults";
import { parseProject, validateProject } from "../src/lib/validation";
import {
  validateMediaFile,
  matchesMediaAsset,
  saveAsset,
} from "../src/lib/storage";

describe("project boundary validation", () => {
  it("round trips a tactical project without mutating the input", () => {
    const project = createProject();
    const roundTrip = parseProject(JSON.stringify(project));
    expect(roundTrip).toEqual(project);
    expect(roundTrip).not.toBe(project);
  });
  it("rejects unsupported versions and malformed files", () => {
    expect(() => validateProject({ ...createProject(), version: 2 })).toThrow();
    expect(() => parseProject("{bad json")).toThrow("not valid project JSON");
  });
  it("rejects invalid coordinates and excess starting players", () => {
    const project = createProject();
    project.scenes[0].players[0].x = Infinity;
    expect(() => validateProject(project)).toThrow();
    project.scenes[0].players[0].x = 10;
    project.scenes[0].players.push({
      ...project.scenes[0].players[0],
      id: "twelfth-home-player",
      onPitch: true,
    });
    expect(() => validateProject(project)).toThrow("eleven starting players");
  });
  it("rejects duplicate and dangling scene identities", () => {
    const project = createProject();
    project.activeSceneId = "missing";
    expect(() => validateProject(project)).toThrow("Active scene is missing");
    project.activeSceneId = project.scenes[0].id;
    project.scenes.push(structuredClone(project.scenes[0]));
    expect(() => validateProject(project)).toThrow("Duplicate scene");
  });
  it("rejects external media URLs and unsafe badge schemes", () => {
    const project = createProject();
    const remote = {
      ...project,
      assets: [
        {
          id: "asset1",
          name: "x",
          kind: "image",
          mime: "image/png",
          size: 1,
          url: "https://evil.example/image.png",
        },
      ],
    };
    expect(() => validateProject(remote)).toThrow();
    project.home.badge = "javascript:alert(1)";
    expect(() => validateProject(project)).toThrow();
  });
  it("rejects orphan media and keyframes beyond the scene", () => {
    const project = createProject();
    project.scenes[0].mediaId = "missing";
    expect(() => validateProject(project)).toThrow("Scene media");
    delete project.scenes[0].mediaId;
    project.scenes[0].keyframes = [{ id: "frame", time: 99, positions: {} }];
    expect(() => validateProject(project)).toThrow("within the scene");
  });
  it("treats note and player text as plain data", () => {
    const project = createProject();
    project.scenes[0].notes = "<script>alert(1)</script>";
    project.scenes[0].players[0].name = "<img onerror=alert(1)>";
    expect(validateProject(project).scenes[0].notes).toBe(
      project.scenes[0].notes,
    );
  });
});
describe("media validation", () => {
  it("accepts supported media and rejects active or oversized content", () => {
    expect(
      validateMediaFile({ name: "match.mp4", type: "video/mp4", size: 100 }),
    ).toBe("video");
    expect(
      validateMediaFile({ name: "frame.png", type: "image/png", size: 100 }),
    ).toBe("image");
    expect(() =>
      validateMediaFile({
        name: "attack.svg",
        type: "image/svg+xml",
        size: 100,
      }),
    ).toThrow();
    expect(() =>
      validateMediaFile({ name: "empty.png", type: "image/png", size: 0 }),
    ).toThrow("empty");
    expect(() =>
      validateMediaFile({
        name: "huge.mp4",
        type: "video/mp4",
        size: 3 * 1024 * 1024 * 1024,
      }),
    ).toThrow("2 GB");
  });
});

describe("media reattachment", () => {
  const asset = {
    id: "original-asset",
    name: "analysis.mp4",
    mime: "video/mp4",
    kind: "video" as const,
    size: 12345,
  };
  it("matches only the exact original file metadata", () => {
    const original = { name: "analysis.mp4", type: "video/mp4", size: 12345 };
    expect(matchesMediaAsset(original, asset)).toBe(true);
    expect(matchesMediaAsset({ ...original, name: "other.mp4" }, asset)).toBe(
      false,
    );
    expect(matchesMediaAsset({ ...original, size: 12346 }, asset)).toBe(false);
    expect(matchesMediaAsset({ ...original, type: "video/webm" }, asset)).toBe(
      false,
    );
    expect(matchesMediaAsset(original, { ...asset, kind: "image" })).toBe(
      false,
    );
  });
  it("rejects unsafe preferred asset identities before accessing storage", async () => {
    const file = new File([new Uint8Array([1])], "frame.png", {
      type: "image/png",
    });
    for (const id of ["", "../asset", "__proto__", "x".repeat(129)]) {
      await expect(saveAsset(file, id)).rejects.toThrow(
        "identifier is invalid",
      );
    }
  });
});
