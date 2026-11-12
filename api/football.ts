import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { ProviderCache } from "../server/data/cache.js";
import {
  createFootballProvider,
  footballStatus,
} from "../server/data/index.js";
import { FootballDataError } from "../server/data/types.js";
import { requireStudio } from "../server/auth.js";

const cache = new ProviderCache();
const limits = new Map<string, { count: number; reset: number }>();
const querySchema = z
  .object({
    op: z
      .enum(["status", "teams", "competitions", "fixtures", "match"])
      .default("status"),
    q: z.string().trim().max(100).optional(),
    teamId: z
      .string()
      .regex(/^(?:api-football:)?\d{1,12}$/)
      .optional(),
    competitionId: z
      .string()
      .regex(/^(?:api-football:)?\d{1,12}$/)
      .optional(),
    season: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (value) =>
          !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
          new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
      )
      .optional(),
    id: z
      .string()
      .regex(/^(?:api-football:)?\d{1,12}$/)
      .optional(),
  })
  .strict();

export function validateFootballQuery(query: unknown) {
  const parsed = querySchema.safeParse(query);
  if (!parsed.success)
    throw new FootballDataError(
      "INVALID_QUERY",
      "Choose a valid operation and valid search filters.",
      400,
    );
  const value = parsed.data;
  if (value.op === "teams" && (!value.q || value.q.length < 3))
    throw new FootballDataError(
      "INVALID_QUERY",
      "Enter at least three characters to search clubs.",
      400,
    );
  if (value.op === "competitions" && value.q && value.q.length < 3)
    throw new FootballDataError(
      "INVALID_QUERY",
      "Enter at least three characters to search competitions.",
      400,
    );
  if (
    value.op === "fixtures" &&
    !value.date &&
    !(value.season && (value.teamId || value.competitionId))
  )
    throw new FootballDataError(
      "INVALID_QUERY",
      "Choose a fixture date, or a season with a club or competition.",
      400,
    );
  if (value.op === "match" && !value.id)
    throw new FootballDataError(
      "INVALID_QUERY",
      "Choose a match to load.",
      400,
    );
  return value;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET")
    return res.status(405).setHeader("Allow", "GET").json({
      error: "METHOD_NOT_ALLOWED",
      message: "Use GET for football data.",
    });
  try {
    const query = validateFootballQuery(req.query);
    const state = footballStatus();
    if (query.op === "status") return res.status(200).json(state);
    if (!requireStudio(req, res)) return;
    const ip = String(
      req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown",
    )
      .split(",")[0]
      .trim();
    const now = Date.now();
    const limit = limits.get(ip);
    if (limit && limit.reset > now && limit.count >= 60) {
      res.setHeader(
        "Retry-After",
        String(Math.ceil((limit.reset - now) / 1000)),
      );
      throw new FootballDataError(
        "RATE_LIMIT",
        "Too many requests. Wait a moment before searching again.",
        429,
      );
    }
    if (!limit || limit.reset <= now)
      limits.set(ip, { count: 1, reset: now + 60_000 });
    else limit.count++;
    if (limits.size > 1000)
      for (const [key, value] of limits)
        if (value.reset < now) limits.delete(key);
    if (limits.size > 1500) limits.delete(limits.keys().next().value!);
    const provider = createFootballProvider();
    // Include license state in the cache key so revoking badge rights takes effect immediately.
    const key = JSON.stringify([state.provider, state.badgesLicensed, query]);
    const reference = query.op === "teams" || query.op === "competitions";
    const ttl = reference
      ? 86_400_000
      : query.op === "match"
        ? 60_000
        : 120_000;
    const result = await cache.get<unknown>(
      key,
      provider.id,
      ttl,
      reference ? 86_400_000 : 900_000,
      async () => {
        switch (query.op) {
          case "teams":
            return provider.searchTeams(query.q!);
          case "competitions":
            return provider.searchCompetitions(query.q ?? "", query.season);
          case "fixtures":
            return provider.fixtures(query);
          case "match":
            return provider.match(query.id!);
        }
      },
    );
    return res.status(200).json(result);
  } catch (error) {
    const known = error instanceof FootballDataError;
    return res.status(known ? error.status : 500).json({
      error: known ? error.code : "INTERNAL_ERROR",
      message: known ? error.message : "Football data could not be loaded.",
      configured: footballStatus().configured,
    });
  }
}
