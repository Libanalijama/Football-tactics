import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  OfficialLineup,
  OfficialMatch,
  OfficialPlayer,
  OfficialTeam,
} from "../../src/types.js";
import { ProviderCache } from "./cache.js";
import { FootballDataError } from "./types.js";
import type { DataEnvelope } from "./types.js";

export const PUBLIC_LEAGUES = [
  { id: "eng.1", name: "Premier League", country: "England", archive: "en.1" },
  {
    id: "uefa.champions",
    name: "Champions League",
    country: "Europe",
    archive: null,
  },
  { id: "esp.1", name: "LaLiga", country: "Spain", archive: "es.1" },
  { id: "ger.1", name: "Bundesliga", country: "Germany", archive: "de.1" },
  { id: "ita.1", name: "Serie A", country: "Italy", archive: "it.1" },
  { id: "fra.1", name: "Ligue 1", country: "France", archive: "fr.1" },
  { id: "eng.2", name: "Championship", country: "England", archive: "en.2" },
  { id: "usa.1", name: "MLS", country: "United States", archive: null },
] as const;
export type PublicLeague = (typeof PUBLIC_LEAGUES)[number]["id"];
export interface PublicFixtureQuery {
  league: PublicLeague;
  from: string;
  to: string;
  source?: "espn" | "openfootball";
}
interface Options {
  fetch?: typeof fetch;
  badgesLicensed?: boolean;
}
interface FixturePayload {
  matches: OfficialMatch[];
  provider: string;
  warning?: string;
  retrievedAt?: string;
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.length ? value : undefined;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const numericId = (value: unknown): string | undefined =>
  typeof value === "string" && /^\d{1,15}$/.test(value)
    ? value
    : typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? String(value)
      : undefined;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 20);

export function publicLeague(value: string): PublicLeague {
  if (!PUBLIC_LEAGUES.some((item) => item.id === value))
    throw new FootballDataError(
      "INVALID_LEAGUE",
      "Choose one of the available competitions.",
      400,
    );
  return value as PublicLeague;
}

export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

export function validatePublicRange(from: string, to: string): void {
  if (!validDate(from) || !validDate(to))
    throw new FootballDataError(
      "INVALID_DATE",
      "Choose valid fixture dates.",
      400,
    );
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (days < 0 || days > 30)
    throw new FootballDataError(
      "INVALID_RANGE",
      "Choose a fixture range of up to 31 days.",
      400,
    );
}

function licensedBadge(value: unknown, licensed: boolean): string | undefined {
  if (!licensed || typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      [
        "a.espncdn.com",
        "a1.espncdn.com",
        "a2.espncdn.com",
        "a3.espncdn.com",
        "a4.espncdn.com",
      ].includes(url.hostname)
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function espnTeam(raw: unknown, licensed: boolean): OfficialTeam {
  const value = record(raw),
    id = numericId(value.id),
    name = text(value.displayName) ?? text(value.name);
  if (!id || !name)
    throw new FootballDataError(
      "INVALID_PUBLIC_DATA",
      "A match contains an incomplete team record.",
    );
  const logo = value.logo ?? record(list(value.logos)[0]).href;
  const badge = licensedBadge(logo, licensed);
  return {
    id: `espn:team:${id}`,
    name: name.slice(0, 160),
    shortName: (
      text(value.abbreviation) ?? name.slice(0, 3).toUpperCase()
    ).slice(0, 32),
    ...(badge ? { badge } : {}),
  };
}

function score(value: unknown): number | null {
  const raw = typeof value === "object" && value ? record(value).value : value;
  if (
    (typeof raw !== "string" || !/^\d+$/.test(raw)) &&
    typeof raw !== "number"
  )
    return null;
  const number = Number(raw);
  return Number.isInteger(number) && number >= 0 && number <= 999
    ? number
    : null;
}

export function normalizeEspnEvent(
  raw: unknown,
  league: PublicLeague,
  licensed = false,
  retrievedAt = new Date().toISOString(),
): OfficialMatch {
  const event = record(raw),
    competition = record(list(event.competitions)[0]);
  const id = numericId(event.id) ?? numericId(competition.id);
  const date = text(event.date) ?? text(competition.date);
  const competitors = list(competition.competitors).map(record);
  const home = competitors.find((item) => item.homeAway === "home"),
    away = competitors.find((item) => item.homeAway === "away");
  if (!id || !date || Number.isNaN(Date.parse(date)) || !home || !away)
    throw new FootballDataError(
      "INVALID_PUBLIC_DATA",
      "The public source returned an incomplete fixture.",
    );
  const state = record(record(competition.status ?? event.status).type);
  const hasScore = state.state === "in" || state.state === "post";
  const leagueInfo = PUBLIC_LEAGUES.find((item) => item.id === league)!;
  const season = record(event.season);
  const year =
    typeof season.year === "number" || typeof season.year === "string"
      ? String(season.year)
      : "";
  return {
    id: `espn:${league}:${id}`,
    provider: "espn",
    retrievedAt,
    kickoff: new Date(date).toISOString(),
    competition: text(competition.altGameNote) ?? leagueInfo.name,
    season: year,
    venue:
      text(record(competition.venue).fullName) ??
      text(record(event.venue).displayName) ??
      null,
    status:
      text(state.shortDetail) ??
      text(state.description) ??
      "Status unavailable",
    home: espnTeam(home.team, licensed),
    away: espnTeam(away.team, licensed),
    score: {
      home: hasScore ? score(home.score) : null,
      away: hasScore ? score(away.score) : null,
    },
    lineups: [],
    events: [],
  };
}

function role(code: string | undefined): string | null {
  if (!code || code === "SUB") return null;
  if (["G", "GK"].includes(code)) return "GK";
  if (/^(?:[LRC]?B|[LRC]?D|CD|CB|WB|LWB|RWB)(?:-|$)/.test(code)) return "DEF";
  if (/^(?:D?M|AM|CM|LM|RM)/.test(code)) return "MID";
  if (/^(?:F|CF|ST|LW|RW|LF|RF)/.test(code)) return "FWD";
  return code.slice(0, 80);
}

function lineupOrder(raw: Record<string, unknown>): number {
  const code = text(record(raw.position).abbreviation) ?? "";
  const category = role(code);
  const group =
    category === "GK"
      ? 0
      : category === "DEF"
        ? 1
        : /^DM/.test(code)
          ? 2
          : /^AM/.test(code)
            ? 4
            : category === "MID"
              ? 3
              : category === "FWD"
                ? 5
                : 6;
  const lateral = ["LB", "LWB", "LM", "LW", "AM-L"].includes(code)
    ? -2
    : ["RB", "RWB", "RM", "RW", "AM-R"].includes(code)
      ? 2
      : code.endsWith("-L")
        ? -1
        : code.endsWith("-R")
          ? 1
          : 0;
  const place = Number(raw.formationPlace);
  return group * 1000 + lateral * 100 + (Number.isFinite(place) ? place : 99);
}

export function normalizeEspnLineup(
  raw: unknown,
  teamId: string,
): OfficialLineup {
  const sheet = record(raw);
  const entries = list(sheet.roster).map(record);
  const normalizePlayer = (
    entry: Record<string, unknown>,
  ): OfficialPlayer | null => {
    const athlete = record(entry.athlete),
      id = numericId(athlete.id),
      name = text(athlete.displayName) ?? text(athlete.fullName);
    if (!id || !name) return null;
    const jersey = entry.jersey ?? athlete.jersey;
    const number =
      typeof jersey === "string" && /^\d{1,3}$/.test(jersey)
        ? Number(jersey)
        : typeof jersey === "number" &&
            Number.isInteger(jersey) &&
            jersey >= 0 &&
            jersey <= 999
          ? jersey
          : null;
    return {
      id: `espn:player:${id}`,
      name: name.slice(0, 160),
      number,
      position: role(text(record(entry.position).abbreviation)),
    };
  };
  const collect = (starter: boolean) =>
    entries
      .filter((entry) => entry.starter === starter)
      .sort((a, b) => (starter ? lineupOrder(a) - lineupOrder(b) : 0))
      .map(normalizePlayer)
      .filter((player): player is OfficialPlayer => player !== null);
  const starters = collect(true).slice(0, 11),
    substitutes = collect(false).slice(0, 40);
  return {
    teamId,
    status: starters.length ? "provider-reported" : "unavailable",
    formation: text(sheet.formation)?.slice(0, 32) ?? null,
    starters,
    substitutes,
  };
}

export function normalizeEspnSummary(
  raw: unknown,
  league: PublicLeague,
  licensed = false,
  retrievedAt = new Date().toISOString(),
): OfficialMatch {
  const summary = record(raw),
    header = record(summary.header);
  const match = normalizeEspnEvent(header, league, licensed, retrievedAt);
  match.competition = text(record(header.league).name) ?? match.competition;
  match.venue =
    text(record(record(summary.gameInfo).venue).fullName) ?? match.venue;
  const sheets = list(summary.rosters).map(record);
  match.lineups = [match.home, match.away].map((team) => {
    const sheet = sheets.find(
      (item) => `espn:team:${numericId(record(item.team).id)}` === team.id,
    );
    return normalizeEspnLineup(sheet, team.id);
  });
  const competition = record(list(header.competitions)[0]);
  match.events = list(summary.keyEvents ?? competition.details)
    .flatMap((rawEvent, index) => {
      const event = record(rawEvent),
        teamId = numericId(record(event.team).id);
      const clock = text(record(event.clock).displayValue) ?? "";
      const minuteText = clock.match(/^\s*(\d+)/)?.[1];
      const type =
        text(record(event.type).text) ??
        (event.scoringPlay === true
          ? "Goal"
          : event.redCard === true
            ? "Red card"
            : undefined);
      if (!teamId || !minuteText || !type || Number(minuteText) > 999)
        return [];
      const participants = list(event.participants ?? event.athletesInvolved)
        .map((item) => {
          const p = record(item);
          return text(record(p.athlete).displayName) ?? text(p.displayName);
        })
        .filter((name): name is string => Boolean(name));
      return [
        {
          id: `${match.id}:event:${numericId(event.id) ?? index}`,
          minute: Number(minuteText),
          type: type.slice(0, 80),
          teamId: `espn:team:${teamId}`,
          player: participants.join(" / ").slice(0, 160),
          detail: [clock, text(event.text)]
            .filter(Boolean)
            .join(" · ")
            .slice(0, 500),
        },
      ];
    })
    .slice(0, 1000);
  return match;
}

const archiveMatchSchema = z
  .object({
    date: z.string(),
    team1: z.string().min(1),
    team2: z.string().min(1),
    score: z
      .union([
        z.array(z.number()),
        z.object({ ft: z.array(z.number()).optional() }).passthrough(),
      ])
      .optional(),
  })
  .passthrough();
function archiveSeason(date: string): string {
  const year =
    Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 7 ? 1 : 0);
  return `${year}-${String(year + 1).slice(-2)}`;
}

export function normalizeOpenFootballMatch(
  raw: unknown,
  league: PublicLeague,
  season: string,
  competitionName: string,
  retrievedAt = new Date().toISOString(),
): OfficialMatch {
  const parsed = archiveMatchSchema.safeParse(raw);
  if (!parsed.success || !validDate(parsed.data.date))
    throw new FootballDataError(
      "INVALID_ARCHIVE_DATA",
      "The open fixture archive returned an incomplete record.",
    );
  const entry = parsed.data;
  const pair = Array.isArray(entry.score) ? entry.score : entry.score?.ft;
  const goals =
    pair?.length === 2
      ? { home: score(pair[0]), away: score(pair[1]) }
      : { home: null, away: null };
  const home = {
    id: `openfootball:team:${digest(entry.team1)}`,
    name: entry.team1.slice(0, 160),
    shortName: entry.team1
      .replace(/\b(?:FC|AFC)\b/g, "")
      .trim()
      .slice(0, 3)
      .toUpperCase(),
  };
  const away = {
    id: `openfootball:team:${digest(entry.team2)}`,
    name: entry.team2.slice(0, 160),
    shortName: entry.team2
      .replace(/\b(?:FC|AFC)\b/g, "")
      .trim()
      .slice(0, 3)
      .toUpperCase(),
  };
  const id = `openfootball:${league}:${season}:${digest(`${entry.date}|${entry.team1}|${entry.team2}`)}`;
  return {
    id,
    provider: "openfootball",
    retrievedAt,
    kickoff: entry.date,
    competition: competitionName.slice(0, 160),
    season,
    venue: null,
    status: goals.home !== null && goals.away !== null ? "FT" : "Fixture",
    home,
    away,
    score: goals,
    // The archive does not guarantee kickoff timezone, players or lineups.
    lineups: [home, away].map((team) => ({
      teamId: team.id,
      status: "unavailable",
      formation: null,
      starters: [],
      substitutes: [],
    })),
    events: [],
  };
}

export function parsePublicMatchId(id: string): {
  provider: "espn" | "openfootball";
  league: PublicLeague;
  event?: string;
  season?: string;
  key?: string;
} {
  const espn = /^espn:([a-z0-9.]+):(\d{1,15})$/.exec(id);
  if (espn)
    return { provider: "espn", league: publicLeague(espn[1]), event: espn[2] };
  const archive =
    /^openfootball:([a-z0-9.]+):(\d{4}-\d{2}):([a-f0-9]{20})$/.exec(id);
  if (archive)
    return {
      provider: "openfootball",
      league: publicLeague(archive[1]),
      season: archive[2],
      key: archive[3],
    };
  throw new FootballDataError(
    "INVALID_MATCH_ID",
    "Choose a match from the fixture list.",
    400,
  );
}

export class PublicFootballService {
  private readonly request: typeof fetch;
  private readonly licensed: boolean;
  private readonly cache = new ProviderCache(120);
  private readonly archives = new ProviderCache(24);
  constructor(options: Options = {}) {
    this.request = options.fetch ?? fetch;
    this.licensed = options.badgesLicensed === true;
  }

  private async json(url: URL): Promise<unknown> {
    let response: Response;
    try {
      response = await this.request(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new FootballDataError(
        "PUBLIC_SOURCE_UNAVAILABLE",
        "The public match source could not be reached. Try again shortly.",
        503,
      );
    }
    if (!response.ok)
      throw new FootballDataError(
        "PUBLIC_SOURCE_UNAVAILABLE",
        "The public match source is temporarily unavailable.",
        503,
      );
    try {
      return await response.json();
    } catch {
      throw new FootballDataError(
        "INVALID_PUBLIC_DATA",
        "The public match source returned an unreadable response.",
      );
    }
  }

  private async archive(
    league: PublicLeague,
    season: string,
  ): Promise<{ name: string; matches: unknown[]; retrievedAt: string }> {
    const config = PUBLIC_LEAGUES.find((item) => item.id === league)!;
    if (!config.archive)
      throw new FootballDataError(
        "ARCHIVE_UNAVAILABLE",
        "This competition's public fixture source is temporarily unavailable. Try another date or competition.",
        503,
      );
    const envelope = await this.archives.get(
      `${league}:${season}`,
      "openfootball",
      86_400_000,
      0,
      async () => {
        const raw = record(
          await this.json(
            new URL(
              `https://raw.githubusercontent.com/openfootball/football.json/master/${season}/${config.archive}.json`,
            ),
          ),
        );
        if (!text(raw.name) || !Array.isArray(raw.matches))
          throw new FootballDataError(
            "INVALID_ARCHIVE_DATA",
            "The open fixture archive is unavailable.",
          );
        return { name: String(raw.name), matches: raw.matches as unknown[] };
      },
    );
    return { ...envelope.data, retrievedAt: envelope.retrievedAt };
  }

  async fixtures(
    query: PublicFixtureQuery,
  ): Promise<DataEnvelope<OfficialMatch[]>> {
    validatePublicRange(query.from, query.to);
    publicLeague(query.league);
    const loadArchive = async (warning?: string): Promise<FixturePayload> => {
      const seasons = [
        ...new Set([archiveSeason(query.from), archiveSeason(query.to)]),
      ];
      const archives = await Promise.all(
        seasons.map(async (season) => {
          const source = await this.archive(query.league, season);
          return {
            matches: source.matches.map((item) =>
              normalizeOpenFootballMatch(
                item,
                query.league,
                season,
                source.name,
                source.retrievedAt,
              ),
            ),
            retrievedAt: source.retrievedAt,
          };
        }),
      );
      return {
        matches: archives.flatMap((archive) => archive.matches),
        provider: "openfootball",
        retrievedAt: archives.map((archive) => archive.retrievedAt).sort()[0],
        ...(warning ? { warning } : {}),
      };
    };
    const result = await this.cache.get<FixturePayload>(
      `fixtures:${query.source ?? "espn"}:${query.league}:${query.from}:${query.to}`,
      "public-football",
      300_000,
      1_800_000,
      async () => {
        if (query.source === "openfootball") return loadArchive();
        try {
          // Soccer's public scoreboard accepts YYYYMM; date-range strings return 400.
          const months: string[] = [];
          const cursor = new Date(`${query.from.slice(0, 7)}-01T00:00:00Z`);
          while (cursor.toISOString().slice(0, 7) <= query.to.slice(0, 7)) {
            months.push(cursor.toISOString().slice(0, 7));
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
          }
          const batches = await Promise.all(
            months.map(async (month) => {
              const url = new URL(
                `https://site.api.espn.com/apis/site/v2/sports/soccer/${query.league}/scoreboard`,
              );
              url.searchParams.set("dates", month.replace("-", ""));
              url.searchParams.set("limit", "1000");
              const data = record(await this.json(url));
              if (!Array.isArray(data.events))
                throw new FootballDataError(
                  "INVALID_PUBLIC_DATA",
                  "The public source returned no fixture collection.",
                );
              return data.events.map((event) =>
                normalizeEspnEvent(event, query.league, this.licensed),
              );
            }),
          );
          const matches = [
            ...new Map(
              batches.flat().map((match) => [match.id, match]),
            ).values(),
          ];
          return { matches, provider: "espn" };
        } catch {
          return loadArchive(
            "ESPN is unavailable. Showing the Openfootball CC0 fixture archive; team sheets and kickoff times are unavailable.",
          );
        }
      },
    );
    const payload = result.data;
    return {
      ...result,
      provider: payload.provider,
      retrievedAt: payload.retrievedAt ?? result.retrievedAt,
      data: payload.matches
        .filter(
          (match) =>
            match.kickoff.slice(0, 10) >= query.from &&
            match.kickoff.slice(0, 10) <= query.to,
        )
        .sort((a, b) => a.kickoff.localeCompare(b.kickoff)),
      ...(payload.warning
        ? {
            warning: [payload.warning, result.warning]
              .filter(Boolean)
              .join(" "),
          }
        : {}),
    };
  }

  async match(id: string): Promise<DataEnvelope<OfficialMatch>> {
    const parsed = parsePublicMatchId(id);
    const result = await this.cache.get(
      id,
      parsed.provider,
      120_000,
      3_600_000,
      async () => {
        if (parsed.provider === "espn") {
          const url = new URL(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${parsed.league}/summary`,
          );
          url.searchParams.set("event", parsed.event!);
          const match = normalizeEspnSummary(
            await this.json(url),
            parsed.league,
            this.licensed,
          );
          if (match.id !== id)
            throw new FootballDataError(
              "MATCH_NOT_FOUND",
              "The selected match could not be found.",
              404,
            );
          return match;
        }
        const source = await this.archive(parsed.league, parsed.season!);
        const match = source.matches
          .map((item) =>
            normalizeOpenFootballMatch(
              item,
              parsed.league,
              parsed.season!,
              source.name,
              source.retrievedAt,
            ),
          )
          .find((item) => item.id === id);
        if (!match)
          throw new FootballDataError(
            "MATCH_NOT_FOUND",
            "This fixture is no longer available in the archive.",
            404,
          );
        return match;
      },
    );
    return { ...result, retrievedAt: result.data.retrievedAt };
  }
}
