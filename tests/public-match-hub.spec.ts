import { test, expect } from "@playwright/test";
import type { OfficialMatch } from "../src/types";

// Deterministic synthetic contracts test the UI without passing samples as a feed.
function fixture(id = "espn:eng.1:42", home = "Contract Home"): OfficialMatch {
  return {
    id,
    provider: id.startsWith("openfootball") ? "openfootball" : "espn",
    retrievedAt: "2026-11-12T20:00:00.000Z",
    kickoff: "2026-11-12T14:00:00.000Z",
    competition: "Contract League",
    season: "2026",
    venue: null,
    status: "FT",
    home: { id: "espn:team:1", name: home, shortName: "CTH" },
    away: { id: "espn:team:2", name: "Contract Away", shortName: "CTA" },
    score: { home: 2, away: 1 },
    lineups: [],
    events: [],
  };
}
function teamSheet(): OfficialMatch {
  const match = fixture();
  match.lineups = [match.home, match.away].map((team, index) => ({
    teamId: team.id,
    status: "provider-reported",
    formation: "4-3-3",
    starters: Array.from({ length: 11 }, (_, i) => ({
      id: `espn:player:${index * 100 + i + 1}`,
      name: `${index ? "Away" : "Home"} Contract ${i + 1}`,
      number: i + 1,
      position: i === 0 ? "GK" : i < 5 ? "DEF" : i < 8 ? "MID" : "FWD",
    })),
    substitutes: [],
  }));
  return match;
}

test("match browser opens with nearby fixtures, filters clubs and imports reported team sheets without unlocking", async ({
  page,
}) => {
  const queries: URL[] = [];
  let sessionCalls = 0;
  await page.route("**/api/session*", async (route) => {
    sessionCalls++;
    await route.fulfill({
      status: 401,
      json: {
        message: "Authentication is intentionally unavailable in this test.",
      },
    });
  });
  await page.route("**/api/public-football?**", async (route) => {
    const url = new URL(route.request().url());
    queries.push(url);
    await route.fulfill({
      json: {
        data:
          url.searchParams.get("op") === "match"
            ? teamSheet()
            : [fixture(), fixture("espn:eng.1:43", "Other Club")],
        provider: "espn",
        retrievedAt: "2026-11-12T20:00:00.000Z",
        stale: false,
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Match hub", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Contract Home versus Contract Away" }),
  ).toBeVisible();
  expect(queries[0].searchParams.get("league")).toBe("eng.1");
  expect(queries[0].searchParams.get("source")).toBe("espn");
  expect(queries[0].searchParams.get("from")).not.toBe(
    queries[0].searchParams.get("to"),
  );
  await expect(
    page.getByRole("textbox", { name: "Studio password" }),
  ).toHaveCount(0);
  await expect(page.locator(".match-hub [placeholder]")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Filter matches by club" })
    .fill("Other");
  await expect(
    page.getByRole("button", { name: "Contract Home versus Contract Away" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Other Club versus Contract Away" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Filter matches by club" }).fill("");
  await page
    .getByRole("button", { name: "Contract Home versus Contract Away" })
    .click();
  await expect(page.getByLabel("Selected match details")).toContainText(
    "Home Contract 1",
  );
  await expect(page.getByText("Reported XI", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Use match and team sheets" }).click();
  const board = page.locator(".board-container [data-testid=board-svg]");
  await expect(board.locator("[data-player-id]")).toHaveCount(22);
  await expect(board).toContainText("Home Contract 1");
  expect(sessionCalls).toBe(0);
});

test("public-domain source is an explicit choice and imports no fictional team sheet", async ({
  page,
}) => {
  const archive = fixture("openfootball:eng.1:2026-27:12345678901234567890");
  archive.kickoff = "2026-11-12";
  archive.lineups = [archive.home, archive.away].map((team) => ({
    teamId: team.id,
    status: "unavailable",
    formation: null,
    starters: [],
    substitutes: [],
  }));
  const sources: string[] = [];
  await page.route("**/api/public-football?**", async (route) => {
    const url = new URL(route.request().url());
    sources.push(url.searchParams.get("source") ?? "");
    const cc0 =
      url.searchParams.get("source") === "openfootball" ||
      url.searchParams.get("id")?.startsWith("openfootball");
    await route.fulfill({
      json: {
        data:
          url.searchParams.get("op") === "match"
            ? archive
            : [cc0 ? archive : fixture()],
        provider: cc0 ? "openfootball" : "espn",
        retrievedAt: "2026-11-12T20:00:00.000Z",
        stale: false,
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Match hub", exact: true }).click();
  await page
    .getByRole("button", { name: "Openfootball · CC0 fixtures" })
    .click();
  await expect(
    page.getByRole("button", { name: "Contract Home versus Contract Away" }),
  ).toBeVisible();
  expect(sources).toContain("openfootball");
  await page
    .getByRole("button", { name: "Contract Home versus Contract Away" })
    .click();
  await expect(page.getByLabel("Selected match details")).toContainText(
    "Kickoff time unavailable",
  );
  await expect(page.getByLabel("Selected match details")).toContainText(
    "0 starters",
  );
  await page.getByRole("button", { name: "Use match details" }).click();
  await expect(page.locator(".board-container [data-player-id]")).toHaveCount(
    0,
  );
});
