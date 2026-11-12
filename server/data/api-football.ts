import { z } from "zod";
import type {
  OfficialLineup,
  OfficialMatch,
  OfficialPlayer,
  OfficialTeam,
} from "../../src/types.js";
import { FootballDataError } from "./types.js";
import type { Competition, FixtureQuery, FootballProvider } from "./types.js";

const identifier = z.number().int().nonnegative();
const teamSchema = z.object({
  id: identifier,
  name: z.string().min(1),
  code: z.string().nullable().optional(),
  logo: z.string().nullable().optional(),
});
const fixtureSchema = z.object({
  fixture: z.object({
    id: identifier,
    date: z.string().datetime({ offset: true }),
    venue: z.object({ name: z.string().nullable().optional() }).optional(),
    status: z.object({ short: z.string() }),
  }),
  league: z.object({ name: z.string(), season: z.number().int() }),
  teams: z.object({ home: teamSchema, away: teamSchema }),
  goals: z.object({ home: z.number().nullable(), away: z.number().nullable() }),
});
const playerSchema = z.object({
  player: z.object({
    id: identifier,
    name: z.string(),
    number: z.number().int().nullable().optional(),
    pos: z.string().nullable().optional(),
  }),
});
const lineupSchema = z.object({
  team: teamSchema,
  formation: z.string().nullable().optional(),
  startXI: z.array(playerSchema).max(11),
  substitutes: z.array(playerSchema).max(40),
});
const eventSchema = z.object({
  time: z.object({
    elapsed: z.number().int().nonnegative(),
    extra: z.number().int().nonnegative().nullable().optional(),
  }),
  team: z.object({ id: identifier }),
  player: z.object({ name: z.string().nullable() }),
  assist: z.object({ name: z.string().nullable() }).optional(),
  type: z.string(),
  detail: z.string().nullable().optional(),
});
const competitionSchema = z.object({
  league: z.object({ id: identifier, name: z.string() }),
  country: z.object({ name: z.string() }),
  seasons: z.array(
    z.object({ year: z.number().int(), current: z.boolean().optional() }),
  ),
});

const scopedId = (value: number) => `api-football:${value}`;
export function nativeId(value: string): string {
  const id = value.replace(/^api-football:/, "");
  if (!/^\d{1,12}$/.test(id))
    throw new FootballDataError(
      "INVALID_ID",
      "Use a valid provider identifier.",
      400,
    );
  return id;
}

function safeBadge(
  value: string | null | undefined,
  licensed: boolean,
): string | undefined {
  if (!licensed || !value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      [
        "media.api-sports.io",
        "media-1.api-sports.io",
        "media-2.api-sports.io",
        "media-3.api-sports.io",
      ].includes(url.hostname)
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function team(
  value: z.infer<typeof teamSchema>,
  licensed: boolean,
): OfficialTeam {
  const badge = safeBadge(value.logo, licensed);
  return {
    id: scopedId(value.id),
    name: value.name,
    shortName: value.code || value.name.slice(0, 3).toUpperCase(),
    ...(badge ? { badge } : {}),
  };
}

export function normalizeFixture(
  raw: unknown,
  licensed = false,
  retrievedAt = new Date().toISOString(),
): OfficialMatch {
  const parsed = fixtureSchema.safeParse(raw);
  if (!parsed.success)
    throw new FootballDataError(
      "INVALID_PROVIDER_DATA",
      "The provider returned an incomplete match record.",
    );
  const value = parsed.data;
  return {
    id: scopedId(value.fixture.id),
    provider: "api-football",
    retrievedAt,
    kickoff: value.fixture.date,
    competition: value.league.name,
    season: String(value.league.season),
    venue: value.fixture.venue?.name ?? null,
    status: value.fixture.status.short,
    home: team(value.teams.home, licensed),
    away: team(value.teams.away, licensed),
    score: value.goals,
    lineups: [],
    events: [],
  };
}

export function normalizeLineup(raw: unknown): OfficialLineup {
  const parsed = lineupSchema.safeParse(raw);
  if (!parsed.success)
    throw new FootballDataError(
      "INVALID_PROVIDER_DATA",
      "The provider returned an incomplete lineup record.",
    );
  const value = parsed.data;
  const roles: Record<string, string> = {
    G: "GK",
    D: "DEF",
    M: "MID",
    F: "FWD",
  };
  const normalizePlayer = ({
    player,
  }: z.infer<typeof playerSchema>): OfficialPlayer => ({
    id: scopedId(player.id),
    name: player.name,
    number: player.number ?? null,
    position: player.pos ? (roles[player.pos] ?? player.pos) : null,
  });
  return {
    teamId: scopedId(value.team.id),
    // This API has no explicit confirmation flag. An operator reviews the reported XI.
    status: value.startXI.length ? "provider-reported" : "unavailable",
    formation: value.formation ?? null,
    starters: value.startXI.map(normalizePlayer),
    substitutes: value.substitutes.map(normalizePlayer),
  };
}

interface ProviderOptions {
  apiKey: string;
  badgesLicensed?: boolean;
  fetch?: typeof fetch;
}

export class ApiFootballProvider implements FootballProvider {
  readonly id = "api-football";
  private readonly request: typeof fetch;
  private readonly licensed: boolean;
  constructor(private readonly options: ProviderOptions) {
    this.request = options.fetch ?? fetch;
    this.licensed = options.badgesLicensed === true;
  }

  private async call(
    path: string,
    params: Record<string, string | undefined>,
  ): Promise<unknown[]> {
    const url = new URL(path, "https://v3.football.api-sports.io/");
    for (const [key, value] of Object.entries(params))
      if (value !== undefined) url.searchParams.set(key, value);
    let response: Response;
    try {
      response = await this.request(url, {
        headers: {
          "x-apisports-key": this.options.apiKey,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new FootballDataError(
        "PROVIDER_UNAVAILABLE",
        "The football data provider could not be reached. Try again shortly.",
        503,
      );
    }
    if (!response.ok)
      throw new FootballDataError(
        response.status === 429
          ? "PROVIDER_RATE_LIMIT"
          : "PROVIDER_UNAVAILABLE",
        response.status === 429
          ? "The provider request quota has been reached. Try again later."
          : "The football data provider rejected the request.",
        response.status === 429 ? 429 : 502,
      );
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FootballDataError(
        "INVALID_PROVIDER_DATA",
        "The provider returned an unreadable response.",
      );
    }
    const envelope = z
      .object({
        errors: z
          .union([z.array(z.unknown()), z.record(z.string(), z.unknown())])
          .optional(),
        response: z.array(z.unknown()),
      })
      .safeParse(payload);
    if (!envelope.success)
      throw new FootballDataError(
        "INVALID_PROVIDER_DATA",
        "The provider returned an unexpected response.",
      );
    if (envelope.data.errors && Object.keys(envelope.data.errors).length > 0)
      throw new FootballDataError(
        "PROVIDER_ERROR",
        "The provider could not complete this request. Check account access and coverage.",
      );
    return envelope.data.response;
  }

  async searchTeams(query: string): Promise<OfficialTeam[]> {
    return (await this.call("teams", { search: query })).map((raw) => {
      const parsed = z.object({ team: teamSchema }).safeParse(raw);
      if (!parsed.success)
        throw new FootballDataError(
          "INVALID_PROVIDER_DATA",
          "The provider returned an incomplete team record.",
        );
      return team(parsed.data.team, this.licensed);
    });
  }

  async searchCompetitions(
    query: string,
    season?: string,
  ): Promise<Competition[]> {
    return (
      await this.call("leagues", { search: query || undefined, season })
    ).map((raw) => {
      const parsed = competitionSchema.safeParse(raw);
      if (!parsed.success)
        throw new FootballDataError(
          "INVALID_PROVIDER_DATA",
          "The provider returned an incomplete competition record.",
        );
      const value = parsed.data;
      const chosen =
        season ?? value.seasons.find((item) => item.current)?.year.toString();
      return {
        id: scopedId(value.league.id),
        name: value.league.name,
        country: value.country.name,
        seasons: value.seasons.map((item) => String(item.year)),
        ...(chosen ? { season: chosen } : {}),
      };
    });
  }

  async fixtures(query: FixtureQuery): Promise<OfficialMatch[]> {
    const records = await this.call("fixtures", {
      team: query.teamId ? nativeId(query.teamId) : undefined,
      league: query.competitionId ? nativeId(query.competitionId) : undefined,
      season: query.season,
      date: query.date,
      timezone: "UTC",
    });
    return records.map((raw) => normalizeFixture(raw, this.licensed));
  }

  async match(id: string): Promise<OfficialMatch> {
    const fixtureId = nativeId(id);
    const [records, lineups, events] = await Promise.all([
      this.call("fixtures", { id: fixtureId }),
      this.call("fixtures/lineups", { fixture: fixtureId }),
      this.call("fixtures/events", { fixture: fixtureId }),
    ]);
    if (records.length !== 1)
      throw new FootballDataError(
        "MATCH_NOT_FOUND",
        "This match was not found in the selected provider.",
        404,
      );
    const match = normalizeFixture(records[0], this.licensed);
    match.lineups = lineups.map(normalizeLineup);
    for (const side of [match.home, match.away]) {
      if (!match.lineups.some((lineup) => lineup.teamId === side.id))
        match.lineups.push({
          teamId: side.id,
          status: "unavailable",
          formation: null,
          starters: [],
          substitutes: [],
        });
    }
    match.events = events.map((raw, index) => {
      const parsed = eventSchema.safeParse(raw);
      if (!parsed.success)
        throw new FootballDataError(
          "INVALID_PROVIDER_DATA",
          "The provider returned an incomplete match event.",
        );
      const value = parsed.data;
      const minute = value.time.elapsed;
      const extra = value.time.extra ? ` (${minute}+${value.time.extra}′)` : "";
      const substitution =
        value.type.toLowerCase() === "subst" && value.assist?.name
          ? ` · ${value.assist.name}`
          : "";
      return {
        id: `${match.id}:event:${index}`,
        minute,
        type: value.type,
        teamId: scopedId(value.team.id),
        player: value.player.name ?? "",
        detail: `${value.detail ?? ""}${substitution}${extra}`.trim(),
      };
    });
    return match;
  }
}
