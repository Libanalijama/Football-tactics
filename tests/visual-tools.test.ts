import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnnotationShape } from "../src/components/Board";
import type { Annotation } from "../src/types";

const graphic = (type: Annotation["type"], calibrated = true) =>
  renderToStaticMarkup(
    createElement(
      "svg",
      null,
      createElement(AnnotationShape, {
        annotation: {
          id: "tool",
          type,
          points: [
            { x: 0, y: 50 },
            { x: 100, y: 50 },
          ],
          color: "#c6f36b",
          width: 2,
        },
        calibrated,
      }),
    ),
  );
describe("broadcast drawing tools", () => {
  it("renders an editorial heat zone without inventing tracking statistics", () => {
    const svg = graphic("heat");
    expect(svg).toContain("radialGradient");
    expect(svg).toContain("<ellipse");
    expect(svg).not.toContain("undefined");
    expect(svg).not.toContain("105.0 m");
  });
  it("renders a directional cone as a translucent triangle", () => {
    const svg = graphic("cone");
    expect(svg).toContain("<polygon");
    expect(svg).toContain("linearGradient");
    expect(svg).not.toContain("undefined");
  });
  it("renders connected shape edges", () => {
    expect(graphic("link")).toContain("<polygon");
  });
  it("labels pitch distance in meters and uncalibrated footage as a guide", () => {
    expect(graphic("distance")).toContain("105.0 m");
    expect(graphic("distance", false)).toContain(">Guide<");
    expect(graphic("distance", false)).not.toContain("105.0 m");
  });
});
