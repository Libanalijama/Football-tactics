import { describe, expect, it, vi } from "vitest";
import {
  ApiFootballProvider,
  nativeId,
  normalizeFixture,
  normalizeLineup,
} from "../server/data/api-football.js";
import { ProviderCache } from "../server/data/cache.js";
import {
  createFootballProvider,
  footballStatus,
} from "../server/data/index.js";
import { validateFootballQuery } from "../api/football.js";

// Synthetic records verify contracts. They are never served as football data.
const fixture = {
  fixture: {
    id: 10,
    date: "2026-11-12T20:00:00+00:00",
    venue: { name: "Test Ground" },
    status: { short: "NS" },
  },
  league: { name: "Contract Test League", season: 2026 },
  teams: {
    home: {
      id: 1,
      name: "Test Home",
      logo: "https://media.api-sports.io/football/teams/1.png",
    },
    away: { id: 2, name: "Test Away", logo: "https://unsafe.example/2.png" },
  },
  goals: { home: null, away: null },
};
const lineup = {
  team: { id: 1, name: "Test Home" },
  formation: "4-3-3",
  startXI: Array.from({ length: 11 }, (_, index) => ({
    player: {
      id: index + 1,
      name: `Test player ${index + 1}`,
      number: index + 1,
      pos: index ? "M" : "G",
    },
  })),
  substitutes: [
    { player: { id: 22, name: "Test substitute", number: null, pos: null } },
  ],
};

describe("football normalization", () => {
  it("preserves unknown score and supplies no invented lineups", () => {
    const match = normalizeFixture(fixture);
    expect(match.score).toEqual({ home: null, away: null });
    expect(match.lineups).toEqual([]);
    expect(match.events).toEqual([]);
    expect(match.home.id).toBe("api-football:1");
    expect(match.home.badge).toBeUndefined();
  });
  it("requires explicit rights and a trusted HTTPS host for badge URLs", () => {
    expect(normalizeFixture(fixture, true).home.badge).toBe(
      "https://media.api-sports.io/football/teams/1.png",
    );
    expect(normalizeFixture(fixture, true).away.badge).toBeUndefined();
    expect(
      normalizeFixture(
        {
          ...fixture,
          teams: {
            ...fixture.teams,
            home: { ...fixture.teams.home, logo: "javascript:alert(1)" },
          },
        },
        true,
      ).home.badge,
    ).toBeUndefined();
  });
  it("never infers confirmation from a complete XI", () => {
    const result = normalizeLineup(lineup);
    expect(result.status).toBe("provider-reported");
    expect(result.starters).toHaveLength(11);
    expect(result.starters[0].position).toBe("GK");
    expect(result.substitutes[0].number).toBeNull();
    expect(normalizeLineup({ ...lineup, startXI: [] }).status).toBe(
      "unavailable",
    );
  });
  it("rejects malformed provider records rather than filling fictional values", () => {
    expect(() => normalizeFixture({ ...fixture, teams: {} })).toThrow(
      "incomplete match",
    );
    expect(() =>
      normalizeLineup({
        ...lineup,
        startXI: [{ player: { name: "Unknown identity" } }],
      }),
    ).toThrow("incomplete lineup");
    expect(() => nativeId("sportmonks:1")).toThrow();
    expect(nativeId("api-football:10")).toBe("10");
  });
});

describe("provider requests", () => {
  it("uses only server headers and preserves missing lineups", async () => {
    const mockFetch = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      return Response.json({
        errors: [],
        response: url.pathname === "/fixtures" ? [fixture] : [],
      });
    });
    const provider = new ApiFootballProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });
    const match = await provider.match("api-football:10");
    expect(match.lineups.map((value) => value.status)).toEqual([
      "unavailable",
      "unavailable",
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    for (const [input, init] of mockFetch.mock.calls) {
      expect(String(input)).not.toContain("test-key");
      expect(init?.headers).toMatchObject({ "x-apisports-key": "test-key" });
      expect(new URL(String(input)).hostname).toBe("v3.football.api-sports.io");
    }
  });
  it("handles provider error envelopes without exposing provider messages", async () => {
    const provider = new ApiFootballProvider({
      apiKey: "secret",
      fetch: async () =>
        Response.json({ errors: { token: "secret invalid" }, response: [] }),
    });
    await expect(provider.searchTeams("Test")).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
    await expect(provider.searchTeams("Test")).rejects.not.toThrow("secret");
  });
  it("reports quota exhaustion and malformed JSON", async () => {
    const throttled = new ApiFootballProvider({
      apiKey: "test",
      fetch: async () => new Response("", { status: 429 }),
    });
    await expect(throttled.searchTeams("Test")).rejects.toMatchObject({
      status: 429,
    });
    const malformed = new ApiFootballProvider({
      apiKey: "test",
      fetch: async () => new Response("not JSON"),
    });
    await expect(malformed.searchTeams("Test")).rejects.toMatchObject({
      code: "INVALID_PROVIDER_DATA",
    });
  });
  it("keeps unsupported and unconfigured providers unavailable", () => {
    expect(footballStatus({})).toEqual({
      provider: "api-football",
      configured: false,
      badgesLicensed: false,
    });
    expect(() => createFootballProvider({})).toThrow("not connected");
    expect(() =>
      createFootballProvider({
        FOOTBALL_PROVIDER: "unknown",
        FOOTBALL_API_KEY: "x",
      }),
    ).toThrow("not installed");
  });
});

describe("provider cache", () => {
  it("coalesces requests, isolates mutations, and labels bounded stale fallback", async () => {
    let now = 1000;
    const cache = new ProviderCache(2, () => now);
    const load = vi.fn(async () => ({ score: 1 }));
    const [first, second] = await Promise.all([
      cache.get("a", "test", 100, 200, load),
      cache.get("a", "test", 100, 200, load),
    ]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    first.data.score = 100;
    expect((await cache.get("a", "test", 100, 200, load)).data.score).toBe(1);
    now = 1150;
    const failed = vi.fn(async () => {
      throw new Error("offline");
    });
    const stale = await cache.get("a", "test", 100, 200, failed);
    expect(stale.stale).toBe(true);
    expect(stale.retrievedAt).toBe(new Date(1000).toISOString());
    expect(stale.warning).toContain("previously retrieved");
    now = 1301;
    await expect(cache.get("a", "test", 100, 200, failed)).rejects.toThrow(
      "offline",
    );
  });
  it("evicts old entries and does not cache failed initial loads", async () => {
    const cache = new ProviderCache(1);
    const load = vi.fn(async () => 1);
    await cache.get("a", "test", 1000, 1000, load);
    await cache.get("b", "test", 1000, 1000, load);
    await cache.get("a", "test", 1000, 1000, load);
    expect(load).toHaveBeenCalledTimes(3);
    const failed = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(cache.get("c", "test", 1000, 1000, failed)).rejects.toThrow();
    await expect(cache.get("c", "test", 1000, 1000, failed)).rejects.toThrow();
    expect(failed).toHaveBeenCalledTimes(2);
  });
});

describe("football query validation", () => {
  it("validates scope and calendar dates", () => {
    expect(() => validateFootballQuery({ op: "fixtures" })).toThrow();
    expect(() =>
      validateFootballQuery({ op: "fixtures", date: "2026-02-31" }),
    ).toThrow();
    expect(() =>
      validateFootballQuery({
        op: "fixtures",
        season: "2026",
        teamId: "api-football:1",
      }),
    ).not.toThrow();
    expect(() => validateFootballQuery({ op: "teams", q: "ab" })).toThrow();
    expect(() =>
      validateFootballQuery({
        op: "match",
        id: "1",
        url: "https://evil.example",
      }),
    ).toThrow();
    expect(() =>
      validateFootballQuery({ op: ["match", "teams"], id: "1" }),
    ).toThrow();
  });
});
