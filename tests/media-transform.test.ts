import { describe, it, expect } from "vitest";
import {
  DEFAULT_MEDIA_TRANSFORM,
  mediaPlacement,
  mediaCssTransform,
  panMedia,
  resizeMedia,
  normalizeMediaTransform,
} from "../src/lib/media-transform";
import { createProject } from "../src/lib/defaults";
import { validateProject } from "../src/lib/validation";

describe("media placement shared by board and exports", () => {
  it("fits the entire source and fills without stretching", () => {
    const contain = mediaPlacement(
      { width: 1920, height: 1080 },
      { width: 1200, height: 780 },
    );
    expect(contain.width).toBe(1200);
    expect(contain.height).toBe(675);
    expect(contain.center).toEqual({ x: 600, y: 390 });
    const cover = mediaPlacement(
      { width: 1920, height: 1080 },
      { width: 1200, height: 780 },
      { fit: "cover" },
    );
    expect(cover.height).toBe(780);
    expect(cover.width).toBeCloseTo(1386.6667, 3);
  });
  it("applies translation, rotation and scale around the picture center", () => {
    const placement = mediaPlacement(
      { width: 100, height: 100 },
      { width: 1200, height: 780 },
      { x: 25, y: -10, scale: 2, rotation: 90 },
    );
    expect(placement.center).toEqual({ x: 900, y: 312 });
    expect(placement.width).toBe(1560);
    expect(placement.corners[0].x).toBeCloseTo(1680);
    expect(placement.corners[0].y).toBeCloseTo(-468);
    expect(mediaCssTransform(placement.transform)).toBe(
      "translate(25%, -10%) rotate(90deg) scale(2)",
    );
  });
  it("pans independently of picture scale and resizes around its center", () => {
    const input = { ...DEFAULT_MEDIA_TRANSFORM, scale: 2 };
    expect(
      panMedia(input, { x: 300, y: 200 }, { x: 420, y: 278 }),
    ).toMatchObject({ x: 10, y: 10, scale: 2 });
    expect(
      resizeMedia(
        input,
        { x: 700, y: 390 },
        { x: 800, y: 390 },
        { x: 600, y: 390 },
      ).scale,
    ).toBe(4);
  });
  it("bounds gestures and safely normalizes old projects", () => {
    expect(normalizeMediaTransform()).toEqual(DEFAULT_MEDIA_TRANSFORM);
    expect(
      normalizeMediaTransform({
        x: 1000,
        y: -1000,
        scale: 0,
        rotation: Infinity,
      }),
    ).toEqual({ ...DEFAULT_MEDIA_TRANSFORM, x: 100, y: -100, scale: 0.1 });
  });
  it("round trips optional transforms but rejects invalid imported geometry", () => {
    const project = createProject();
    project.scenes[0].mediaTransform = {
      ...DEFAULT_MEDIA_TRANSFORM,
      scale: 1.5,
    };
    expect(validateProject(project).scenes[0].mediaTransform?.scale).toBe(1.5);
    project.scenes[0].mediaTransform.scale = 0;
    expect(() => validateProject(project)).toThrow();
  });
});
