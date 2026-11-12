import { describe, expect, it, vi } from "vitest";
import {
  PublicFootballService,
  normalizeEspnEvent,
  normalizeEspnLineup,
  normalizeEspnSummary,
  normalizeOpenFootballMatch,
  parsePublicMatchId,
  validatePublicRange,
} from "../server/data/public-football.js";
import { validatePublicQuery } from "../api/public-football.js";
import { createProject } from "../src/lib/defaults";
import { importOfficialMatch } from "../src/lib/match-import";
import { validateProject } from "../src/lib/validation";

// Synthetic contract fixtures; none are served by the application as real data.
function event(state = "post", id = "42", date = "2026-11-08T14:00Z") {
  return {
    id,
    date,
    season: { year: 2026 },
    competitions: [
      {
        id,
        date,
        status: {
          type: { state, shortDetail: state === "post" ? "FT" : "Scheduled" },
        },
        venue: { fullName: "Contract Test Venue" },
        competitors: [
          {
            homeAway: "away",
            score: "1",
            team: {
              id: "2",
              displayName: "Contract Away",
              abbreviation: "CTA",
            },
          },
          {
            homeAway: "home",
            score: "2",
            team: {
              id: "1",
              displayName: "Contract Home",
              abbreviation: "CTH",
              logo: "https://a.espncdn.com/i/teamlogos/soccer/500/1.png",
            },
          },
        ],
      },
    ],
  };
}
const player = (
  id: string,
  position: string,
  starter: boolean | undefined,
  jersey?: string,
) => ({
  athlete: { id, displayName: `Contract athlete ${id}` },
  position: { abbreviation: position },
  starter,
  jersey,
  formationPlace: id,
});
const archive = {
  name: "Contract Test League",
  matches: [
    {
      date: "2026-11-08",
      time: "14:00",
      team1: "Contract Home FC",
      team2: "Contract Away FC",
      score: { ft: [2, 1] },
    },
  ],
};

describe("key-free football normalization", () => {
  it("uses home/away identities and leaves scheduled scores unknown", () => {
    const completed = normalizeEspnEvent(event(), "eng.1");
    expect(completed.id).toBe("espn:eng.1:42");
    expect(completed.home.name).toBe("Contract Home");
    expect(completed.score).toEqual({ home: 2, away: 1 });
    expect(normalizeEspnEvent(event("pre"), "eng.1").score).toEqual({
      home: null,
      away: null,
    });
    expect(() =>
      normalizeEspnEvent({ id: "42", competitions: [] }, "eng.1"),
    ).toThrow("incomplete fixture");
  });

  it("strips badges by default and only accepts licensed ESPN HTTPS images", () => {
    expect(normalizeEspnEvent(event(), "eng.1").home.badge).toBeUndefined();
    expect(normalizeEspnEvent(event(), "eng.1", true).home.badge).toContain(
      "a.espncdn.com",
    );
    const bad = event();
    bad.competitions[0].competitors[1].team.logo =
      "https://unsafe.example/image.png";
    expect(normalizeEspnEvent(bad, "eng.1", true).home.badge).toBeUndefined();
  });

  it("orders starters sensibly, preserves unknown shirts and never infers confirmation", () => {
    const sheet = normalizeEspnLineup(
      {
        formation: "4-2-3-1",
        roster: [
          player("9", "F", true, "9"),
          player("4", "DM", true, "6"),
          player("3", "RB", true, "2"),
          player("2", "LB", true),
          player("1", "G", true, "1"),
          player("12", "SUB", false, "12"),
          player("13", "MID", undefined, "13"),
        ],
      },
      "espn:team:1",
    );
    expect(sheet.status).toBe("provider-reported");
    expect(sheet.starters.map((item) => item.position)).toEqual([
      "GK",
      "DEF",
      "DEF",
      "MID",
      "FWD",
    ]);
    expect(sheet.starters.map((item) => item.id)).toEqual([
      "espn:player:1",
      "espn:player:2",
      "espn:player:3",
      "espn:player:4",
      "espn:player:9",
    ]);
    expect(sheet.starters[1].number).toBeNull();
    expect(sheet.substitutes).toHaveLength(1);
    expect(sheet.substitutes[0].position).toBeNull();
    expect(normalizeEspnLineup(undefined, "espn:team:2")).toMatchObject({
      status: "unavailable",
      starters: [],
      substitutes: [],
    });
  });

  it("retains real event minutes and omits unidentifiable events rather than guessing", () => {
    const summary = normalizeEspnSummary(
      {
        header: event(),
        keyEvents: [
          {
            id: "7",
            type: { text: "Goal" },
            team: { id: "1" },
            clock: { displayValue: "90'+4'" },
            participants: [{ athlete: { displayName: "Contract scorer" } }],
            text: "Contract event detail",
          },
          {
            type: { text: "Goal" },
            team: { id: "1" },
            clock: { displayValue: "" },
          },
        ],
      },
      "eng.1",
    );
    expect(summary.lineups.map((item) => item.status)).toEqual([
      "unavailable",
      "unavailable",
    ]);
    expect(summary.events).toHaveLength(1);
    expect(summary.events[0]).toMatchObject({
      minute: 90,
      player: "Contract scorer",
    });
    expect(summary.events[0].detail).toContain("90'+4'");
    const project = createProject();
    expect(
      validateProject(importOfficialMatch(project, project.scenes[0], summary)),
    ).toBeDefined();
  });

  it("keeps CC0 fallback date-only and has no invented lineup, badges or venue", () => {
    const match = normalizeOpenFootballMatch(
      archive.matches[0],
      "eng.1",
      "2026-27",
      archive.name,
    );
    expect(match.kickoff).toBe("2026-11-08");
    expect(match.provider).toBe("openfootball");
    expect(match.score).toEqual({ home: 2, away: 1 });
    expect(match.venue).toBeNull();
    expect(match.home.badge).toBeUndefined();
    expect(match.lineups).toHaveLength(2);
    expect(
      match.lineups.every(
        (item) => item.status === "unavailable" && !item.starters.length,
      ),
    ).toBe(true);
    expect(parsePublicMatchId(match.id)).toMatchObject({
      provider: "openfootball",
      league: "eng.1",
      season: "2026-27",
    });
  });
});

describe("key-free provider requests", () => {
  it("fetches monthly scoreboards once, bounds the requested dates and caches results", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const month = new URL(String(input)).searchParams.get("dates");
      return Response.json({
        events:
          month === "202610"
            ? [event("post", "41", "2026-10-31T14:00Z")]
            : [event(), event("post", "43", "2026-11-15T14:00Z")],
      });
    });
    const service = new PublicFootballService({ fetch: fetcher });
    const query = {
      league: "eng.1" as const,
      from: "2026-10-30",
      to: "2026-11-09",
    };
    const result = await service.fixtures(query);
    expect(result.provider).toBe("espn");
    expect(result.data.map((item) => item.id)).toEqual([
      "espn:eng.1:41",
      "espn:eng.1:42",
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await service.fixtures(query);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [input, init] of fetcher.mock.calls) {
      expect(new URL(String(input)).hostname).toBe("site.api.espn.com");
      expect(init?.headers).toEqual({ accept: "application/json" });
    }
  });

  it("uses the real archive boundary when ESPN fails, without presenting an XI", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      new URL(String(input)).hostname === "site.api.espn.com"
        ? new Response("", { status: 503 })
        : Response.json(archive),
    );
    const service = new PublicFootballService({ fetch: fetcher });
    const result = await service.fixtures({
      league: "eng.1",
      from: "2026-11-01",
      to: "2026-11-10",
    });
    expect(result.provider).toBe("openfootball");
    expect(result.warning).toContain("CC0");
    expect(result.data).toHaveLength(1);
    const detail = await service.match(result.data[0].id);
    expect(detail.data).toEqual(result.data[0]);
    expect(detail.data.lineups.every((item) => !item.starters.length)).toBe(
      true,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("includes February when a thirty-day window crosses three calendar months", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      Response.json({
        events:
          new URL(String(input)).searchParams.get("dates") === "202602"
            ? [event("post", "42", "2026-02-08T14:00Z")]
            : [],
      }),
    );
    const result = await new PublicFootballService({ fetch: fetcher }).fixtures(
      { league: "eng.1", from: "2026-01-31", to: "2026-03-02" },
    );
    expect(result.data).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("offers explicit CC0 mode without making any ESPN request", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(archive));
    const result = await new PublicFootballService({ fetch: fetcher }).fixtures(
      {
        league: "eng.1",
        from: "2026-11-01",
        to: "2026-11-10",
        source: "openfootball",
      },
    );
    expect(result.provider).toBe("openfootball");
    expect(result.warning).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toBe(
      "https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/en.1.json",
    );
  });

  it("loads a provider-reported match without credentials and validates event identity", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        header: event(),
        rosters: [
          {
            team: { id: "1" },
            formation: "4-3-3",
            roster: [player("1", "G", true, "1")],
          },
        ],
      }),
    );
    const service = new PublicFootballService({ fetch: fetcher });
    const result = await service.match("espn:eng.1:42");
    expect(result.data.lineups[0]).toMatchObject({
      status: "provider-reported",
    });
    expect(result.data.lineups[1]).toMatchObject({ status: "unavailable" });
    await expect(service.match("espn:eng.1:43")).rejects.toMatchObject({
      code: "MATCH_NOT_FOUND",
    });
  });

  it("never substitutes a different archive match for a failed ESPN summary", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response("", { status: 503 }),
    );
    await expect(
      new PublicFootballService({ fetch: fetcher }).match("espn:eng.1:42"),
    ).rejects.toMatchObject({ code: "PUBLIC_SOURCE_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not fabricate matches when the source has an empty date window", async () => {
    const service = new PublicFootballService({
      fetch: async () => Response.json({ events: [] }),
    });
    expect(
      (
        await service.fixtures({
          league: "eng.1",
          from: "2026-11-01",
          to: "2026-11-10",
        })
      ).data,
    ).toEqual([]);
  });
});

describe("public request validation", () => {
  it("allowlists leagues, sources, IDs and finite calendar windows", () => {
    expect(() => validatePublicRange("2026-02-31", "2026-03-01")).toThrow();
    expect(() => validatePublicRange("2026-01-01", "2026-02-15")).toThrow();
    expect(() => validatePublicRange("2026-11-10", "2026-11-01")).toThrow();
    expect(() => parsePublicMatchId("espn:../../evil:42")).toThrow();
    expect(() =>
      validatePublicQuery({ op: "fixtures", league: "evil" }),
    ).toThrow();
    expect(() =>
      validatePublicQuery({ source: "scrape", op: "fixtures" }),
    ).toThrow();
    expect(() => validatePublicQuery({ op: ["match", "fixtures"] })).toThrow();
    expect(() =>
      validatePublicQuery({ op: "fixtures", url: "https://evil.example" }),
    ).toThrow();
    expect(
      validatePublicQuery({
        op: "fixtures",
        source: "openfootball",
        league: "eng.1",
        date: "2026-11-08",
      }),
    ).toMatchObject({
      source: "openfootball",
      from: "2026-11-08",
      to: "2026-11-08",
    });
  });
});
