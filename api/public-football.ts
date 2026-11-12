import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import {
  PUBLIC_LEAGUES,
  PublicFootballService,
  publicLeague,
  validDate,
  validatePublicRange,
} from "../server/data/public-football.js";
import { FootballDataError } from "../server/data/types.js";

const services = new Map<boolean, PublicFootballService>();
const limits = new Map<string, { count: number; reset: number }>();
const querySchema = z
  .object({
    op: z.enum(["status", "fixtures", "match"]).default("fixtures"),
    source: z.enum(["espn", "openfootball"]).default("espn"),
    league: z.string().max(40).default("eng.1"),
    from: z.string().max(10).optional(),
    to: z.string().max(10).optional(),
    date: z.string().max(10).optional(),
    id: z.string().max(128).optional(),
  })
  .strict();

export function validatePublicQuery(input: unknown) {
  const parsed = querySchema.safeParse(input);
  if (!parsed.success)
    throw new FootballDataError(
      "INVALID_QUERY",
      "Choose a valid competition and fixture date.",
      400,
    );
  const query = parsed.data;
  const league = publicLeague(query.league);
  const today = new Date().toISOString().slice(0, 10);
  const from = query.from ?? query.date ?? today,
    to = query.to ?? query.date ?? from;
  if (query.op === "fixtures") validatePublicRange(from, to);
  if (query.op === "match" && !query.id)
    throw new FootballDataError(
      "INVALID_MATCH_ID",
      "Choose a match from the fixture list.",
      400,
    );
  if (query.date && !validDate(query.date))
    throw new FootballDataError(
      "INVALID_DATE",
      "Choose a valid fixture date.",
      400,
    );
  return { ...query, league, from, to };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader(
    "Cache-Control",
    "public, max-age=30, s-maxage=120, stale-while-revalidate=300",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET")
    return res.status(405).setHeader("Allow", "GET").json({
      error: "METHOD_NOT_ALLOWED",
      message: "Use GET to browse public matches.",
    });
  try {
    const query = validatePublicQuery(req.query);
    const badgesLicensed = process.env.FOOTBALL_BADGES_LICENSED === "true";
    if (query.op === "status")
      return res.json({
        available: true,
        keyRequired: false,
        provider: "espn",
        fallback: "openfootball",
        badgesLicensed,
        leagues: PUBLIC_LEAGUES.map(({ id, name, country }) => ({
          id,
          name,
          country,
        })),
      });
    const ip = String(
      req.headers["x-forwarded-for"] ?? req.socket?.remoteAddress ?? "unknown",
    )
      .split(",")[0]
      .trim();
    const now = Date.now(),
      current = limits.get(ip);
    if (current && current.reset > now && current.count >= 120) {
      res.setHeader(
        "Retry-After",
        String(Math.ceil((current.reset - now) / 1000)),
      );
      throw new FootballDataError(
        "RATE_LIMIT",
        "Please wait a moment before refreshing matches.",
        429,
      );
    }
    if (!current || current.reset <= now)
      limits.set(ip, { count: 1, reset: now + 60_000 });
    else current.count++;
    if (limits.size > 1000)
      for (const [key, entry] of limits)
        if (entry.reset <= now) limits.delete(key);
    if (limits.size > 1500) limits.delete(limits.keys().next().value!);
    if (!services.has(badgesLicensed))
      services.set(
        badgesLicensed,
        new PublicFootballService({ badgesLicensed }),
      );
    const service = services.get(badgesLicensed)!;
    return res.json(
      query.op === "match"
        ? await service.match(query.id!)
        : await service.fixtures(query),
    );
  } catch (error) {
    res.setHeader("Cache-Control", "no-store");
    const known = error instanceof FootballDataError;
    return res.status(known ? error.status : 500).json({
      error: known ? error.code : "PUBLIC_DATA_ERROR",
      message: known
        ? error.message
        : "Matches could not be loaded. Try again shortly.",
      keyRequired: false,
    });
  }
}
