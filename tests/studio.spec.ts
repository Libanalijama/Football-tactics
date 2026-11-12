import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

const board = (page: Page) =>
  page.locator('.board-container [data-testid="board-svg"]');
async function dragPlayer(page: Page, player: Locator, dx = 80, dy = 35) {
  const token = await player.locator("circle").first().boundingBox();
  expect(token).not.toBeNull();
  await page.mouse.move(
    token!.x + token!.width / 2,
    token!.y + token!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    token!.x + token!.width / 2 + dx,
    token!.y + token!.height / 2 + dy,
    { steps: 8 },
  );
  await page.mouse.up();
}
async function timeline(page: Page, value: number) {
  const slider = page.getByRole("slider", { name: "Animation timeline" });
  await setSlider(slider, value);
}
async function setSlider(slider: Locator, value: number) {
  await slider.evaluate((element, next) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, String(next));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(board(page)).toBeVisible();
});

for (const size of [
  { width: 1600, height: 1050 },
  { width: 1440, height: 900 },
]) {
  test(`desktop ${size.width}×${size.height} keeps the board and transport visible`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    const dimensions = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      transportBottom: document
        .querySelector(".transport")!
        .getBoundingClientRect().bottom,
      playerSize: document
        .querySelector(".board-container [data-player-id] circle")!
        .getBoundingClientRect().width,
    }));
    expect(dimensions.documentWidth).toBeLessThanOrEqual(size.width);
    expect(dimensions.documentHeight).toBeLessThanOrEqual(size.height);
    expect(dimensions.transportBottom).toBeLessThanOrEqual(size.height);
    expect(dimensions.playerSize).toBeGreaterThanOrEqual(20);
  });
}

test("operator can move a player, undo the move and persist the next edit", async ({
  page,
}) => {
  const player = board(page).locator("[data-player-id]").first();
  const original = await player.getAttribute("transform");
  await dragPlayer(page, player);
  await expect(player).not.toHaveAttribute("transform", original!);
  const edited = await player.getAttribute("transform");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(player).toHaveAttribute("transform", original!);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(player).toHaveAttribute("transform", edited!);
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(board(page).locator("[data-player-id]").first()).toHaveAttribute(
    "transform",
    edited!,
  );
  await expect(board(page).locator("[data-player-id]")).toHaveCount(22);
});

test("drawing a movement arrow creates an editable graphic and delete is undoable", async ({
  page,
}) => {
  const graphics = board(page).locator("[data-annotation-id]");
  const count = await graphics.count();
  await page
    .getByRole("button", { name: "Movement arrow", exact: true })
    .click();
  const bounds = await board(page).boundingBox();
  await page.mouse.move(
    bounds!.x + bounds!.width * 0.35,
    bounds!.y + bounds!.height * 0.25,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds!.x + bounds!.width * 0.55,
    bounds!.y + bounds!.height * 0.4,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(graphics).toHaveCount(count + 1);
  await page
    .getByRole("button", { name: "Delete selected", exact: true })
    .click();
  await expect(graphics).toHaveCount(count);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(graphics).toHaveCount(count + 1);
});

test("position keyframes animate player movement and scenes keep independent edits", async ({
  page,
}) => {
  const player = board(page).locator("[data-player-id]").first();
  const start = await player.getAttribute("transform");
  await page
    .getByRole("button", { name: "Add position keyframe", exact: true })
    .click();
  await timeline(page, 4);
  await dragPlayer(page, player, 120, -35);
  const end = await player.getAttribute("transform");
  expect(end).not.toBe(start);
  await expect(
    page.getByRole("button", { name: "Keyframe at 4s", exact: true }),
  ).toBeVisible();
  await timeline(page, 0);
  await expect(player).toHaveAttribute("transform", start!);
  await timeline(page, 2);
  await expect(player).not.toHaveAttribute("transform", start!);
  await expect(player).not.toHaveAttribute("transform", end!);
  await timeline(page, 0);
  await page
    .getByRole("button", { name: "Play animation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause animation", exact: true }),
  ).toBeVisible();
  await expect(player).not.toHaveAttribute("transform", start!);
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Scene 2: Beat the press", exact: true })
    .click();
  await expect(page.locator(".frame-count")).toHaveText("0 KEYFRAMES");
  await page
    .getByRole("button", { name: "Scene 1: The build-up", exact: true })
    .click();
  await expect(page.locator(".frame-count")).toHaveText("2 KEYFRAMES");
});

test("clean output changes only when a scene is taken live", async ({
  page,
  context,
}) => {
  await page.getByRole("button", { name: "Take live", exact: true }).click();
  const output = await context.newPage();
  await output.goto("/output");
  const outputPlayer = output
    .getByTestId("board-svg")
    .locator("[data-player-id]")
    .first();
  await expect(outputPlayer).toBeVisible();
  const original = await outputPlayer.getAttribute("transform");
  const player = board(page).locator("[data-player-id]").first();
  await dragPlayer(page, player);
  const edited = await player.getAttribute("transform");
  expect(edited).not.toBe(original);
  await expect(outputPlayer).toHaveAttribute("transform", original!);
  await expect(output.getByRole("button")).toHaveCount(0);
  await expect(output.locator("[data-editor-only]")).toHaveCount(0);
  await page.getByRole("button", { name: "Take live", exact: true }).click();
  await expect(outputPlayer).toHaveAttribute("transform", edited!);
  await page
    .getByRole("button", { name: "Blackout programme", exact: true })
    .click();
  await expect(output.locator(".program-picture")).toHaveClass(/blackout/);
  await page
    .getByRole("button", { name: "Blackout programme", exact: true })
    .click();
  await output.setViewportSize({ width: 1920, height: 1080 });
  const fullPicture = await output.locator(".board-wrap").boundingBox();
  expect(fullPicture!.width / fullPicture!.height).toBeCloseTo(1200 / 780, 2);
  expect(fullPicture!.height).toBeLessThanOrEqual(1080);
  await page.getByRole("button", { name: "Scene", exact: true }).click();
  await page.getByLabel("Pitch camera").selectOption("half");
  await page.getByRole("button", { name: "Take live", exact: true }).click();
  await expect(output.getByTestId("board-svg")).toHaveAttribute(
    "viewBox",
    "0 0 630 780",
  );
  const halfPicture = await output.locator(".board-wrap").boundingBox();
  expect(halfPicture!.width / halfPicture!.height).toBeCloseTo(630 / 780, 2);
  expect(halfPicture!.height).toBeLessThanOrEqual(1080);
});

test("still media is stored locally, can be annotated, and reaches clean output", async ({
  page,
  context,
}) => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.getByLabel("Upload analysis media").setInputFiles({
    name: "analysis-still.png",
    mimeType: "image/png",
    buffer: png,
  });
  const image = page.locator(".board-container img");
  await expect(image).toBeVisible();
  await expect(board(page).locator("[data-player-id]")).toHaveCount(0);
  await page.getByRole("button", { name: "Spotlight", exact: true }).click();
  const bounds = await board(page).boundingBox();
  await page.mouse.click(
    bounds!.x + bounds!.width * 0.5,
    bounds!.y + bounds!.height * 0.5,
  );
  await expect(board(page).locator("[data-annotation-id]")).toHaveCount(4);
  await page.waitForTimeout(700);
  await page.reload();
  await expect(image).toBeVisible();
  await expect(board(page).locator("[data-annotation-id]")).toHaveCount(4);
  await page.getByRole("button", { name: "Take live", exact: true }).click();
  const output = await context.newPage();
  await output.goto("/output");
  await expect(output.locator('img[alt="Analysis footage"]')).toBeVisible();
});

test("uploaded video supports seeking and saving a freeze frame", async ({
  page,
  context,
}) => {
  await page
    .getByLabel("Upload analysis media")
    .setInputFiles("tests/fixtures/analysis.mp4");
  await expect(page.locator(".board-container video")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Freeze frame", exact: true }),
  ).toBeVisible();
  const position = page.getByRole("slider", { name: "Video position" });
  await expect(position).not.toHaveAttribute("max", "1");
  await setSlider(position, 0.2);
  await page.getByRole("button", { name: "Freeze frame", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Frame frozen");
  await page.waitForTimeout(650);
  await page.reload();
  await expect
    .poll(() =>
      page
        .locator(".board-container video")
        .evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeCloseTo(0.2, 1);
  await page.getByRole("button", { name: "Scene", exact: true }).click();
  await page.getByLabel("Scene duration").fill("1");
  await page.getByRole("button", { name: "Take live", exact: true }).click();
  const output = await context.newPage();
  await output.goto("/output");
  const outputVideo = output.locator("video");
  await expect(outputVideo).toBeVisible();
  await expect
    .poll(() =>
      outputVideo.evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeCloseTo(0.2, 1);
  const presenter = await context.newPage();
  await presenter.goto("/presenter");
  await presenter
    .getByRole("button", { name: "Play / pause", exact: true })
    .click();
  await expect
    .poll(() =>
      outputVideo.evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThan(0.35);
  await expect
    .poll(() => outputVideo.evaluate((video: HTMLVideoElement) => video.paused))
    .toBe(true);
  expect(
    await outputVideo.evaluate((video: HTMLVideoElement) => video.currentTime),
  ).toBeLessThan(1.5);
});

test("unsupported video shows an operator error and leaves clean output black", async ({
  page,
  context,
}) => {
  await page
    .getByLabel("Upload analysis media")
    .setInputFiles({
      name: "unsupported.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("not a playable media file"),
    });
  await expect(page.getByRole("alert")).toContainText("cannot be played");
  await page.getByRole("button", { name: "Take live", exact: true }).click();
  const output = await context.newPage();
  await output.goto("/output");
  await expect(output.getByTestId("board-svg")).toBeHidden();
  await expect(output.getByRole("alert")).toHaveCount(0);
  await expect(output.locator(".board-wrap")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
});
