import { ApiFootballProvider } from "./api-football.js";
import { FootballDataError } from "./types.js";
import type { FootballProvider } from "./types.js";

export interface FootballEnvironment {
  FOOTBALL_PROVIDER?: string;
  FOOTBALL_API_KEY?: string;
  FOOTBALL_BADGES_LICENSED?: string;
}

export function footballStatus(env: FootballEnvironment = process.env) {
  const provider = env.FOOTBALL_PROVIDER || "api-football";
  return {
    provider,
    configured:
      provider === "api-football" && Boolean(env.FOOTBALL_API_KEY?.trim()),
    badgesLicensed: env.FOOTBALL_BADGES_LICENSED === "true",
  };
}

/** New providers register here; studio state never depends on their raw schemas. */
export function createFootballProvider(
  env: FootballEnvironment = process.env,
  request?: typeof fetch,
): FootballProvider {
  const state = footballStatus(env);
  if (state.provider !== "api-football")
    throw new FootballDataError(
      "UNSUPPORTED_PROVIDER",
      "The configured football data provider is not installed.",
      503,
    );
  if (!state.configured)
    throw new FootballDataError(
      "NOT_CONFIGURED",
      "Live football data is not connected. Configure a licensed provider on the server; manual tactical scenarios remain available.",
      503,
    );
  return new ApiFootballProvider({
    apiKey: env.FOOTBALL_API_KEY!,
    badgesLicensed: state.badgesLicensed,
    fetch: request,
  });
}
