import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AnnotationShape,
  Board,
  fromPitchPoint,
  toPitchPoint,
} from "../src/components/Board";
import { createProject } from "../src/lib/defaults";

describe("broadcast renderer", () => {
  it("uses the same coordinates for drawing and the pitch", () => {
    for (const point of [
      { x: 1, y: 1 },
      { x: 50, y: 50 },
      { x: 99, y: 99 },
    ]) {
      const roundtrip = fromPitchPoint(toPitchPoint(point));
      expect(roundtrip.x).toBeCloseTo(point.x);
      expect(roundtrip.y).toBeCloseTo(point.y);
    }
    expect(fromPitchPoint({ x: -1000, y: 9000 })).toEqual({ x: 1, y: 99 });
  });
  it("renders only the starting players and omits edit selection in clean output", () => {
    const project = createProject();
    const html = renderToStaticMarkup(
      createElement(Board, {
        scene: project.scenes[0],
        home: project.home,
        away: project.away,
        selectedId: project.scenes[0].players[0].id,
      }),
    );
    expect(html.match(/data-player-id=/g)).toHaveLength(22);
    expect(html).not.toContain("data-editor-only");
    expect(html).toContain("BANG ON TACTICS");
  });
  it("renders telestration without pitch players and escapes labels", () => {
    const project = createProject();
    const scene = { ...project.scenes[0], background: "media" as const };
    const html = renderToStaticMarkup(
      createElement(Board, {
        scene,
        home: project.home,
        away: project.away,
        mediaUrl: "blob:local-asset",
      }),
    );
    expect(html).not.toContain("data-player-id");
    expect(html).toContain("Analysis footage");
    const label = renderToStaticMarkup(
      createElement(AnnotationShape, {
        annotation: {
          id: "text",
          type: "text",
          points: [{ x: 30, y: 30 }],
          color: "#fff",
          width: 2,
          text: "<script>alert(1)</script>",
        },
      }),
    );
    expect(label).toContain("&lt;script&gt;");
    expect(label).not.toContain("<script>");
  });
});
