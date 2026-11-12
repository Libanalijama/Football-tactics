import type { Project, MediaTransform } from "../types";
import { mediaPlacement, normalizeMediaTransform } from "./media-transform";
import { validateProject } from "./validation";

const filename = (value: string, extension: string) =>
  `${
    value
      .replace(/[^\w\-. ]/g, "")
      .trim()
      .slice(0, 100) || "bang-on-tactics"
  }.${extension}`;
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function downloadProject(project: Project): void {
  const valid = validateProject(project);
  downloadBlob(
    new Blob([JSON.stringify(valid, null, 2)], { type: "application/json" }),
    filename(valid.name, "bangontactics.json"),
  );
}
function serialized(svg: SVGSVGElement): {
  xml: string;
  width: number;
  height: number;
} {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone
    .querySelectorAll("[data-editor-only]")
    .forEach((element) => element.remove());
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const { width, height } = svg.viewBox.baseVal;
  clone.setAttribute("width", String(width || 1200));
  clone.setAttribute("height", String(height || 780));
  clone.setAttribute("style", "font-family:Arial,Helvetica,sans-serif");
  // React renders SVG text safely; no external resource URLs are introduced by export.
  return {
    xml: new XMLSerializer().serializeToString(clone),
    width: width || 1200,
    height: height || 780,
  };
}
function imageFromSvg(xml: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(
      new Blob([xml], { type: "image/svg+xml;charset=utf-8" }),
    );
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The board could not be rendered for export."));
    };
    img.src = url;
  });
}
async function waitForMedia(
  media: HTMLImageElement | HTMLVideoElement,
): Promise<void> {
  const ready = () =>
    media instanceof HTMLVideoElement
      ? media.readyState >= 2 && !media.seeking
      : media.complete && media.naturalWidth > 0;
  if (ready()) return;
  await new Promise<void>((resolve, reject) => {
    const events =
      media instanceof HTMLVideoElement
        ? ["loadeddata", "canplay", "seeked"]
        : ["load"];
    const cleanup = () => {
      clearTimeout(timer);
      events.forEach((event) => media.removeEventListener(event, check));
      media.removeEventListener("error", error);
    };
    const check = () => {
      if (ready()) {
        cleanup();
        resolve();
      }
    };
    const error = () => {
      cleanup();
      reject(
        new Error(
          "The media could not be decoded. Try a supported image or video format.",
        ),
      );
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "The media is not ready to export. Wait for it to load and try again.",
        ),
      );
    }, 10000);
    events.forEach((event) => media.addEventListener(event, check));
    media.addEventListener("error", error, { once: true });
    check();
  });
}
function drawMedia(
  context: CanvasRenderingContext2D,
  media: HTMLImageElement | HTMLVideoElement,
  width: number,
  height: number,
  transform?: MediaTransform,
): void {
  const sourceWidth =
    media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const sourceHeight =
    media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  if (!sourceWidth || !sourceHeight)
    throw new Error("Wait for the media to load before exporting.");
  let current = transform;
  if (!current && media.dataset.mediaTransform) {
    try {
      current = normalizeMediaTransform(
        JSON.parse(media.dataset.mediaTransform),
      );
    } catch {
      /* Fall back to centered media. */
    }
  }
  const placement = mediaPlacement(
    { width: sourceWidth, height: sourceHeight },
    { width, height },
    current,
  );
  context.save();
  try {
    context.translate(placement.center.x, placement.center.y);
    context.rotate((placement.transform.rotation * Math.PI) / 180);
    context.drawImage(
      media,
      -placement.width / 2,
      -placement.height / 2,
      placement.width,
      placement.height,
    );
  } finally {
    context.restore();
  }
}
async function drawFrame(
  context: CanvasRenderingContext2D,
  svg: SVGSVGElement,
  media?: HTMLImageElement | HTMLVideoElement,
  mediaTransform?: MediaTransform,
): Promise<void> {
  const { xml, width, height } = serialized(svg);
  const image = await imageFromSvg(xml);
  context.clearRect(0, 0, width, height);
  context.fillStyle = media ? "#000" : "#080c10";
  context.fillRect(0, 0, width, height);
  if (media) drawMedia(context, media, width, height, mediaTransform);
  context.drawImage(image, 0, 0, width, height);
}
export function exportBoardSvg(svg: SVGSVGElement, name: string): void {
  const { xml } = serialized(svg);
  downloadBlob(
    new Blob([xml], { type: "image/svg+xml;charset=utf-8" }),
    filename(name, "svg"),
  );
}
export async function exportBoardPng(
  svg: SVGSVGElement,
  name: string,
  media?: HTMLImageElement | HTMLVideoElement,
  mediaTransform?: MediaTransform,
): Promise<void> {
  if (media) await waitForMedia(media);
  const { width, height } = serialized(svg);
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot export images.");
  context.scale(2, 2);
  await drawFrame(context, svg, media, mediaTransform);
  const blob = await new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("Image export failed.")),
        "image/png",
      );
    } catch (error) {
      reject(error);
    }
  });
  downloadBlob(blob, filename(name, "png"));
}
export interface RecordingOptions {
  duration: number;
  onFrame: (time: number) => void;
  mediaElement?: HTMLImageElement | HTMLVideoElement;
  mediaTransform?: MediaTransform;
  fps?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}
export async function recordBoardWebm(
  svg: SVGSVGElement,
  name: string,
  options: RecordingOptions,
): Promise<void> {
  if (!globalThis.MediaRecorder || !HTMLCanvasElement.prototype.captureStream)
    throw new Error(
      "Video export is unavailable in this browser. Use Chrome or Edge to export a WebM.",
    );
  if (
    !Number.isFinite(options.duration) ||
    options.duration <= 0 ||
    options.duration > 600
  )
    throw new Error("Video duration must be between 0 and 600 seconds.");
  const mime = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mime)
    throw new Error("This browser cannot record WebM. Use Chrome or Edge.");
  const { width, height } = serialized(svg);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot render video.");
  const stream = canvas.captureStream(
    Math.max(1, Math.min(60, options.fps ?? 30)),
  );
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: BlobPart[] = [];
  let failed: unknown;
  let drawing = false;
  let frameRequest = 0;
  let stopped = false;
  const stopRecorder = () => {
    if (recorder.state !== "inactive") recorder.stop();
  };
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      failed = new Error("The browser could not complete the recording.");
      stopRecorder();
    };
    recorder.onstop = () => {
      stopped = true;
      cancelAnimationFrame(frameRequest);
      stream.getTracks().forEach((track) => track.stop());
      if (failed) reject(failed);
      else resolve(new Blob(chunks, { type: mime }));
    };
  });
  const abort = () => {
    failed = new Error("Video export cancelled.");
    stopRecorder();
  };
  if (options.signal?.aborted) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("Video export cancelled.");
  }
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    if (options.mediaElement) await waitForMedia(options.mediaElement);
    options.onFrame(0);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    await drawFrame(context, svg, options.mediaElement, options.mediaTransform);
    if (options.signal?.aborted) throw new Error("Video export cancelled.");
    recorder.start(200);
    const started = performance.now();
    const step = async (now: number) => {
      if (stopped || recorder.state === "inactive") return;
      if (drawing) {
        frameRequest = requestAnimationFrame(step);
        return;
      }
      drawing = true;
      try {
        const time = Math.min(options.duration, (now - started) / 1000);
        options.onFrame(time);
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        await drawFrame(
          context,
          svg,
          options.mediaElement,
          options.mediaTransform,
        );
        options.onProgress?.(time / options.duration);
        if (time >= options.duration) {
          recorder.stop();
          return;
        }
      } catch (error) {
        failed = error;
        stopRecorder();
        return;
      } finally {
        drawing = false;
      }
      frameRequest = requestAnimationFrame(step);
    };
    frameRequest = requestAnimationFrame(step);
    const blob = await done;
    if (!blob.size) throw new Error("The recording is empty.");
    downloadBlob(blob, filename(name, "webm"));
  } finally {
    cancelAnimationFrame(frameRequest);
    options.signal?.removeEventListener("abort", abort);
    stopRecorder();
    stream.getTracks().forEach((track) => track.stop());
  }
}
