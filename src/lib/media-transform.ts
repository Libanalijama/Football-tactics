import type { MediaTransform, Point } from "../types";

export const DEFAULT_MEDIA_TRANSFORM: MediaTransform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  fit: "contain",
};
export function normalizeMediaTransform(
  value?: Partial<MediaTransform>,
): MediaTransform {
  const finite = (number: number | undefined, fallback: number) =>
    typeof number === "number" && Number.isFinite(number) ? number : fallback;
  return {
    x: Math.max(-100, Math.min(100, finite(value?.x, 0))),
    y: Math.max(-100, Math.min(100, finite(value?.y, 0))),
    scale: Math.max(0.1, Math.min(4, finite(value?.scale, 1))),
    rotation: Math.max(-180, Math.min(180, finite(value?.rotation, 0))),
    fit: value?.fit === "cover" ? "cover" : "contain",
  };
}
export function mediaPlacement(
  source: { width: number; height: number },
  viewport: { width: number; height: number },
  input?: Partial<MediaTransform>,
) {
  const transform = normalizeMediaTransform(input);
  const sourceWidth = Math.max(1, source.width),
    sourceHeight = Math.max(1, source.height);
  const ratio =
    transform.fit === "cover"
      ? Math.max(viewport.width / sourceWidth, viewport.height / sourceHeight)
      : Math.min(viewport.width / sourceWidth, viewport.height / sourceHeight);
  const width = sourceWidth * ratio * transform.scale,
    height = sourceHeight * ratio * transform.scale;
  const center = {
    x: viewport.width * (0.5 + transform.x / 100),
    y: viewport.height * (0.5 + transform.y / 100),
  };
  const radians = (transform.rotation * Math.PI) / 180;
  const corner = (x: number, y: number): Point => ({
    x: center.x + x * Math.cos(radians) - y * Math.sin(radians),
    y: center.y + x * Math.sin(radians) + y * Math.cos(radians),
  });
  return {
    transform,
    width,
    height,
    center,
    corners: [
      corner(-width / 2, -height / 2),
      corner(width / 2, -height / 2),
      corner(width / 2, height / 2),
      corner(-width / 2, height / 2),
    ],
  };
}
export function mediaCssTransform(input?: Partial<MediaTransform>): string {
  const t = normalizeMediaTransform(input);
  return `translate(${t.x}%, ${t.y}%) rotate(${t.rotation}deg) scale(${t.scale})`;
}
export function panMedia(
  input: MediaTransform,
  start: Point,
  end: Point,
  viewport = { width: 1200, height: 780 },
): MediaTransform {
  return normalizeMediaTransform({
    ...input,
    x: input.x + ((end.x - start.x) / viewport.width) * 100,
    y: input.y + ((end.y - start.y) / viewport.height) * 100,
  });
}
export function resizeMedia(
  input: MediaTransform,
  start: Point,
  end: Point,
  center: Point,
): MediaTransform {
  const initial = Math.hypot(start.x - center.x, start.y - center.y);
  return normalizeMediaTransform({
    ...input,
    scale:
      initial > 1
        ? (input.scale * Math.hypot(end.x - center.x, end.y - center.y)) /
          initial
        : input.scale,
  });
}
