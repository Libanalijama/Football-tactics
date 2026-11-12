import { test, expect } from "@playwright/test";
test("adds a substitute and swaps a selected starter without changing team size", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".board-container svg")).toBeVisible();
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  await page
    .getByRole("button", { name: "Add substitute", exact: true })
    .click();
  await page.getByLabel("Player name", { exact: true }).fill("Alex Brown");
  await page
    .getByRole("button", { name: "Choose substitution", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Player off 2(?:\s|$)/ }).click();
  await dialog
    .getByRole("button", { name: "Make substitution", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".board-container [data-player-id]")).toHaveCount(
    22,
  );
  await expect(page.locator(".player-list").first()).toContainText(
    "Alex Brown",
  );
  await expect(page.locator(".bench-list")).toContainText("DEF");
  await page.waitForTimeout(700);
  await page.reload();
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  await expect(page.locator(".player-list").first()).toContainText(
    "Alex Brown",
  );
});
test("fullscreen retains drawing tools, picture controls and the action panel", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".board-container svg")).toBeVisible();
  await page
    .getByRole("button", { name: "Fullscreen studio", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Movement arrow", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add picture or video", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Actions", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add picture or video", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upload media", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.evaluate(() => document.exitFullscreen());
});
