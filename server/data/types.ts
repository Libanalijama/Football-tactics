import type { OfficialMatch, OfficialTeam } from "../../src/types.js";

export interface Competition {
  id: string;
  name: string;
  country: string;
  season?: string;
  seasons: string[];
}

export interface FixtureQuery {
  teamId?: string;
  competitionId?: string;
  season?: string;
  date?: string;
}

/** Each provider translates its identifiers and payloads at this boundary. */
export interface FootballProvider {
  readonly id: string;
  searchTeams(query: string): Promise<OfficialTeam[]>;
  searchCompetitions(query: string, season?: string): Promise<Competition[]>;
  fixtures(query: FixtureQuery): Promise<OfficialMatch[]>;
  match(id: string): Promise<OfficialMatch>;
}

export class FootballDataError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = "FootballDataError";
  }
}

export interface DataEnvelope<T> {
  data: T;
  provider: string;
  retrievedAt: string;
  stale: boolean;
  warning?: string;
}
