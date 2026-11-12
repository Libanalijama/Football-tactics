import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

const board = (page: Page) =>
  page.locator('.board-container [data-testid="board-svg"]');
const position = async (locator: Locator) => {
  const value = (await locator.getAttribute("transform"))!.match(
    /translate\(([-\d.]+)[ ,]+([-\d.]+)/,
  )!;
  return { x: Number(value[1]), y: Number(value[2]) };
};
async function seek(page: Page, value: number) {
  await page.getByLabel("Animation timeline").evaluate((element, next) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(element, String(next));
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}
async function drag(page: Page, player: Locator, dx = 75, dy = 0) {
  const box = (await player.locator("circle").first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + dx,
    box.y + box.height / 2 + dy,
    { steps: 8 },
  );
  await page.mouse.up();
}
async function stop(page: Page) {
  const pause = page.getByRole("button", {
    name: "Pause animation",
    exact: true,
  });
  if (await pause.isVisible()) await pause.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(board(page)).toBeVisible();
});

test("low block and drop back prepare playable team shapes with physical distances", async ({
  page,
}) => {
  const defender = board(page).locator("[data-player-id]").nth(1),
    start = await position(defender);
  await page.getByRole("button", { name: "Low block", exact: true }).click();
  await stop(page);
  await seek(page, 3);
  const low = await position(defender);
  expect(low.x).toBeLessThan(start.x);
  await expect(board(page).getByTestId("team-shape")).toBeVisible();
  await expect(board(page).getByTestId("opposition-shape")).toBeVisible();
  await expect(board(page).getByTestId("defensive-line")).toHaveCount(3);
  await expect(page.locator(".frame-count")).toHaveText("2 KEYFRAMES");
  await page.getByRole("checkbox", { name: "Distances", exact: true }).check();
  await expect(board(page).getByTestId("team-distances")).toContainText(
    "38.0 m wide",
  );
  await page.getByRole("button", { name: "Drop back", exact: true }).click();
  await stop(page);
  await seek(page, 3);
  const dropped = await position(defender);
  expect(((low.x - dropped.x) / 11.4) * 1.05).toBeCloseTo(10, 1);
  await expect(board(page).getByTestId("running-trail")).not.toHaveCount(0);
  await page.waitForTimeout(650);
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Distances", exact: true }),
  ).toBeChecked();
  await seek(page, 3);
  await expect(board(page).getByTestId("team-shape")).toBeVisible();
});

test("ball stays with its carrier through a run, manual movement step and reload", async ({
  page,
}) => {
  const player = board(page).locator("[data-player-id]").nth(5),
    id = await player.getAttribute("data-player-id");
  const token = (await player.locator("circle").first().boundingBox())!;
  await page.mouse.click(token.x + token.width / 2, token.y + token.height / 2);
  await page
    .getByRole("button", { name: "Give ball to selected player", exact: true })
    .click();
  await expect(board(page).getByTestId("tactical-ball")).toHaveAttribute(
    "data-carrier-id",
    id!,
  );
  await page
    .getByRole("button", { name: "Carry ball forward", exact: true })
    .click();
  await stop(page);
  await seek(page, 0);
  const original = await position(player);
  await seek(page, 1.5);
  const middle = await position(player),
    middleBall = await position(board(page).getByTestId("tactical-ball"));
  expect(middle.x).toBeGreaterThan(original.x);
  expect(middleBall.x - middle.x).toBeCloseTo(26.22, 1);
  await seek(page, 3);
  const end = await position(player);
  expect(end.x).toBeGreaterThan(middle.x);
  await expect(board(page).getByTestId("running-trail")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Movement step", exact: true })
    .click();
  await drag(page, player, 65, -20);
  await expect(page.locator(".frame-count")).toHaveText("3 KEYFRAMES");
  await expect(board(page).getByTestId("tactical-ball")).toHaveAttribute(
    "data-carrier-id",
    id!,
  );
  await page.waitForTimeout(700);
  await expect(page.locator(".save-status")).toContainText("Saved");
  await page.reload();
  await seek(page, 5);
  await expect(board(page).getByTestId("tactical-ball")).toHaveAttribute(
    "data-carrier-id",
    id!,
  );
  const moved = await position(board(page).locator(`[data-player-id="${id}"]`)),
    ball = await position(board(page).getByTestId("tactical-ball"));
  expect(ball.x - moved.x).toBeCloseTo(26.22, 1);
});

test("one movement step captures the start and later drag automatically", async ({
  page,
}) => {
  const player = board(page).locator("[data-player-id]").nth(4),
    initial = await player.getAttribute("transform");
  await page
    .getByRole("button", { name: "Movement step", exact: true })
    .click();
  await drag(page, player, 90, 30);
  const end = await player.getAttribute("transform");
  expect(end).not.toBe(initial);
  await expect(page.locator(".frame-count")).toHaveText("2 KEYFRAMES");
  await seek(page, 0);
  await expect(player).toHaveAttribute("transform", initial!);
  await seek(page, 2);
  await expect(player).toHaveAttribute("transform", end!);
});
