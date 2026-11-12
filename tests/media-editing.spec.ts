import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const board = (page: Page) =>
  page.locator('.board-container [data-testid="board-svg"]');
const picture = (page: Page) =>
  page.locator('.board-container img[alt="Analysis footage"]');
async function setSlider(slider: Locator, value: number) {
  await slider.evaluate((el, next) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(el, String(next));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}
async function uploadPicture(page: Page) {
  const source = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 100;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 100, 100);
    ctx.fillStyle = "#0000ff";
    ctx.fillRect(100, 0, 100, 100);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload analysis media").setInputFiles({
    name: "position-test.png",
    mimeType: "image/png",
    buffer: Buffer.from(source, "base64"),
  });
  await expect(picture(page)).toBeVisible();
}
const transform = (page: Page) =>
  picture(page).evaluate((el) =>
    JSON.parse(el.getAttribute("data-media-transform")!),
  );
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(board(page)).toBeVisible();
});

test("pictures can be resized, dragged, undone, saved and reset", async ({
  page,
  context,
}) => {
  await expect(
    page.getByRole("button", { name: "Add picture or video", exact: true }),
  ).toBeVisible();
  await uploadPicture(page);
  await page.getByLabel("Adjust picture", { exact: true }).click();
  await setSlider(page.getByLabel("Picture size", { exact: true }), 50);
  await page.getByLabel("Adjust picture", { exact: true }).click();
  if (
    (await page
      .getByRole("button", { name: "Move and resize picture", exact: true })
      .getAttribute("aria-pressed")) !== "true"
  )
    await page
      .getByRole("button", { name: "Move and resize picture", exact: true })
      .click();
  await expect(page.getByTestId("media-transform-handles")).toBeVisible();
  const corner = board(page).locator('[data-media-handle="2"]');
  const bounds = await corner.boundingBox();
  const canvas = await board(page).boundingBox();
  expect(bounds).not.toBeNull();
  expect(canvas).not.toBeNull();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2 + canvas!.width * 0.06,
    bounds!.y + bounds!.height / 2 + canvas!.height * 0.06,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await transform(page)).scale)
    .toBeGreaterThan(0.5);
  await page.mouse.move(
    canvas!.x + canvas!.width / 2,
    canvas!.y + canvas!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    canvas!.x + canvas!.width * 0.58,
    canvas!.y + canvas!.height * 0.55,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect.poll(async () => (await transform(page)).x).toBeCloseTo(8, 0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await transform(page)).x).toBeCloseTo(0, 0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(async () => (await transform(page)).x).toBeCloseTo(8, 0);
  await expect(page.locator(".save-status")).toHaveText("Saved on this device");
  const saved = await transform(page);
  await page.reload();
  await expect(picture(page)).toBeVisible();
  expect(await transform(page)).toEqual(saved);
  await page.getByRole("button", { name: "Take live", exact: true }).click();
  const output = await context.newPage();
  await output.goto("/output");
  await expect(output.getByAltText("Analysis footage")).toBeVisible();
  expect(
    await output
      .getByAltText("Analysis footage")
      .getAttribute("data-media-transform"),
  ).toBe(JSON.stringify(saved));
  await page.getByLabel("Adjust picture", { exact: true }).click();
  await page
    .getByRole("button", { name: "Reset picture position", exact: true })
    .click();
  await expect
    .poll(() => transform(page))
    .toEqual({ x: 0, y: 0, scale: 1, rotation: 0, fit: "contain" });
});

test("PNG export matches a resized and repositioned picture", async ({
  page,
}) => {
  await uploadPicture(page);
  await page.getByLabel("Adjust picture", { exact: true }).click();
  await setSlider(page.getByLabel("Picture size", { exact: true }), 50);
  await page
    .getByLabel("Picture horizontal position", { exact: true })
    .fill("20");
  await page.getByLabel("Adjust picture", { exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "High-resolution still" }).click();
  const bytes = await readFile((await (await pending).path())!);
  const samples = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = "data:image/png;base64," + base64;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    return [200, 1200, 1800].map((x) =>
      Array.from(ctx.getImageData(x, 600, 1, 1).data),
    );
  }, bytes.toString("base64"));
  expect(samples[0].slice(0, 3).every((value) => value < 20)).toBe(true);
  expect(samples[1]).toEqual([255, 0, 0, 255]);
  expect(samples[2]).toEqual([0, 0, 255, 255]);
});

test("picture controls and drawing tools fit a 1440 by 900 studio", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await uploadPicture(page);
  await expect(
    page.getByRole("toolbar", { name: "Drawing tools", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add picture or video", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Move and resize picture", exact: true }),
  ).toBeVisible();
  const viewport = await page.evaluate(() => ({
    height: innerHeight,
    scroll: document.documentElement.scrollHeight,
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scroll).toBeLessThanOrEqual(viewport.height);
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width);
});

test("fill-canvas media stays identical between the studio picture and its export after shrinking", async ({
  page,
}) => {
  await uploadPicture(page);
  await page.getByLabel("Adjust picture", { exact: true }).click();
  await page.getByLabel("Picture fit", { exact: true }).selectOption("cover");
  await setSlider(page.getByLabel("Picture size", { exact: true }), 50);
  await page.getByLabel("Adjust picture", { exact: true }).click();
  const screenshot = await page
    .locator('.board-container [data-testid="tactical-board"]')
    .screenshot();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "High-resolution still" }).click();
  const png = await readFile((await (await pending).path())!);
  const colors = await page.evaluate(
    async (images) =>
      Promise.all(
        images.map(async (base64) => {
          const image = new Image();
          image.src = "data:image/png;base64," + base64;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(image, 0, 0);
          return Array.from(
            ctx.getImageData(
              Math.round(image.width * 0.2),
              Math.round(image.height * 0.5),
              1,
              1,
            ).data,
          );
        }),
      ),
    [screenshot.toString("base64"), png.toString("base64")],
  );
  expect(colors[0]).toEqual([255, 0, 0, 255]);
  expect(colors[1]).toEqual(colors[0]);
});
