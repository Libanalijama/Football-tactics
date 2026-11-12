import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ viewport: { width: 1600, height: 1050 } });
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("board-svg").first()).toBeVisible();
});

test("exports a valid project and can import that backup then reload it", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Complete project" }).click();
  const download = await downloadPromise;
  const text = await readFile((await download.path())!, "utf8");
  const project = JSON.parse(text);
  expect(project.version).toBe(1);
  expect(project.scenes.length).toBeGreaterThanOrEqual(1);
  expect(
    project.scenes[0].players.filter(
      (player: { onPitch: boolean }) => player.onPitch,
    ),
  ).toHaveLength(22);
  project.name = "Restored production";
  project.scenes[0].name = "Restored scene";
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByLabel("Import project file").setInputFiles({
    name: "analysis.bangontactics.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(
    page.getByRole("heading", { name: "Restored scene", exact: false }),
  ).toBeVisible();
  await expect(page.locator(".project-title")).toContainText(
    "Restored production",
  );
  await expect(page.locator(".save-status")).toHaveText("Saved on this device");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Restored scene", exact: false }),
  ).toBeVisible();
});

test("exports clean PNG and SVG board artwork", async ({ page }) => {
  await page
    .getByTestId("board-svg")
    .first()
    .locator("[data-player-id]")
    .first()
    .click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pngPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "High-resolution still" }).click();
  const png = await readFile((await (await pngPromise).path())!);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.readUInt32BE(16)).toBe(2400);
  expect(png.readUInt32BE(20)).toBe(1560);
  const svgPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Vector tactical board" }).click();
  const svg = await readFile((await (await svgPromise).path())!, "utf8");
  expect(svg).not.toContain("data-editor-only");
  expect((svg.match(/data-player-id=/g) || []).length).toBe(22);
  const valid = await page.evaluate(
    (xml) =>
      new DOMParser()
        .parseFromString(xml, "image/svg+xml")
        .querySelector("parsererror") === null,
    svg,
  );
  expect(valid).toBe(true);
});

test("composites locally saved image footage into the PNG export", async ({
  page,
}) => {
  const source = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 160, 90);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload analysis media").setInputFiles({
    name: "analysis-frame.png",
    mimeType: "image/png",
    buffer: Buffer.from(source, "base64"),
  });
  await expect(page.getByAltText("Analysis footage").first()).toBeVisible();
  await expect(page.locator(".save-status")).toHaveText("Saved on this device");
  await page.reload();
  await expect(page.getByAltText("Analysis footage").first()).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "High-resolution still" }).click();
  const png = await readFile((await (await downloadPromise).path())!);
  const pixel = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = "data:image/png;base64," + base64;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    return Array.from(ctx.getImageData(100, 400, 1, 1).data);
  }, png.toString("base64"));
  expect(pixel).toEqual([255, 0, 0, 255]);
});

test("records a playable silent WebM from the current scene", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Board settings", exact: true })
    .click();
  await page.getByLabel("Scene duration", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: "Add position keyframe", exact: true })
    .click();
  const timeline = page.getByLabel("Animation timeline", { exact: true });
  await timeline.focus();
  await timeline.press("End");
  const player = page
    .getByTestId("board-svg")
    .first()
    .locator("[data-player-id]")
    .first();
  const token = await player.locator("circle").first().boundingBox();
  expect(token).not.toBeNull();
  await page.mouse.move(
    token!.x + token!.width / 2,
    token!.y + token!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    token!.x + token!.width / 2 + 100,
    token!.y + token!.height / 2 + 30,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Keyframe at 1s", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download", { timeout: 20_000 });
  await page.getByRole("button", { name: "Animated analysis clip" }).click();
  await expect(
    page.getByRole("heading", { name: "Recording your analysis" }),
  ).toBeVisible();
  const webm = await readFile((await (await downloadPromise).path())!);
  expect(webm.subarray(0, 4).toString("hex")).toBe("1a45dfa3");
  expect(webm.length).toBeGreaterThan(1024);
  const decoded = await page.evaluate(async (base64) => {
    const video = document.createElement("video");
    video.muted = true;
    video.src = "data:video/webm;base64," + base64;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Exported WebM could not decode"));
    });
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    const hash = () => {
      ctx.drawImage(video, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let total = 0;
      for (let index = 0; index < pixels.length; index += 31)
        total = (total + pixels[index] * ((index % 97) + 1)) % 1000000007;
      return total;
    };
    const first = hash();
    video.currentTime = 0.8;
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });
    return {
      width: video.videoWidth,
      height: video.videoHeight,
      first,
      last: hash(),
    };
  }, webm.toString("base64"));
  expect(decoded.width).toBe(1200);
  expect(decoded.height).toBe(780);
  expect(decoded.first).not.toBe(decoded.last);
  await expect(
    page.getByRole("heading", { name: "Recording your analysis" }),
  ).not.toBeVisible();
});

test("reattaches an original video to imported media references without losing the frozen frame", async ({
  page,
}) => {
  const original = "tests/fixtures/analysis.mp4";
  await page.getByLabel("Upload analysis media").setInputFiles(original);
  const video = page.locator(".board-container video");
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
    .toBeGreaterThanOrEqual(2);
  await video.evaluate((el: HTMLVideoElement) => {
    el.currentTime = 0.2;
  });
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeCloseTo(0.2, 1);
  await page.getByRole("button", { name: "Freeze frame", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("Saved on this device");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const beforeDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Complete project" }).click();
  const before = JSON.parse(
    await readFile((await (await beforeDownload).path())!, "utf8"),
  );
  const mediaId = before.assets[0].id as string;
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.evaluate(async (id) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("bang-on-tactics", 1);
      open.onerror = () => reject(new Error("Could not open media database"));
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("assets", "readwrite");
        tx.objectStore("assets").delete(id);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(new Error("Could not clear test media"));
      };
    });
  }, mediaId);
  await page.reload();
  await expect(page.getByRole("status")).toContainText("not on this device");
  await expect(page.locator(".board-container video")).toHaveCount(0);
  await page.getByLabel("Upload analysis media").setInputFiles(original);
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeCloseTo(0.2, 1);
  await expect(page.locator(".save-status")).toHaveText("Saved on this device");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const afterDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Complete project" }).click();
  const after = JSON.parse(
    await readFile((await (await afterDownload).path())!, "utf8"),
  );
  expect(after.assets).toHaveLength(1);
  expect(after.assets[0].id).toBe(mediaId);
  expect(
    after.scenes.find(
      (scene: { id: string }) => scene.id === after.activeSceneId,
    ).mediaTime,
  ).toBeCloseTo(0.2, 1);
});
