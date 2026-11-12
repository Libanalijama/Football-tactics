import { useState } from "react";
import {
  Search,
  CalendarDays,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  LoaderCircle,
} from "lucide-react";
import type { OfficialMatch, OfficialTeam } from "../types";
import { studioRequest } from "../lib/api";
type Envelope<T> = { data: T; stale: boolean; warning?: string };
type Competition = {
  id: string;
  name: string;
  country: string;
  seasons: string[];
};
export function MatchHub({
  onImport,
  onUnlock,
}: {
  onImport: (match: OfficialMatch) => void;
  onUnlock: () => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"teams" | "competitions">("teams");
  const [teams, setTeams] = useState<OfficialTeam[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [fixtures, setFixtures] = useState<OfficialMatch[]>([]);
  const [match, setMatch] = useState<OfficialMatch>();
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  async function run<T>(
    op: string,
    params: Record<string, string>,
    apply: (data: T) => void,
  ) {
    setBusy(true);
    setError("");
    try {
      const result = await studioRequest<Envelope<T>>(
        `/api/football?${new URLSearchParams({ op, ...params })}`,
      );
      apply(result.data);
      setWarning(
        result.warning ??
          (result.stale
            ? "Provider unavailable. Showing cached data with its original timestamp."
            : ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data could not be loaded.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="match-hub">
      <div className="notice">
        <ShieldCheck size={18} />
        <div>
          <strong>Real data. Clear provenance.</strong>
          <p>
            A licensed provider connection is required. Manual scenarios are
            always available.
          </p>
        </div>
        <button className="text-button" onClick={onUnlock}>
          Unlock services <ArrowRight size={14} />
        </button>
      </div>
      <form
        className="search-row"
        onSubmit={(e) => {
          e.preventDefault();
          void run<OfficialTeam[] | Competition[]>(
            kind,
            { q: query, season },
            (data) =>
              kind === "teams"
                ? setTeams(data as OfficialTeam[])
                : setCompetitions(data as Competition[]),
          );
        }}
      >
        <select
          aria-label="Search category"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          <option value="teams">Clubs</option>
          <option value="competitions">Competitions</option>
        </select>
        <div className="input-icon">
          <Search size={16} />
          <input
            placeholder={
              kind === "teams" ? "Search clubs…" : "Search competitions…"
            }
            aria-label="Search football data"
            minLength={3}
            required
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <input
          className="season-input"
          aria-label="Season starting year"
          type="number"
          min="1900"
          max="2100"
          value={season}
          onChange={(e) => setSeason(e.target.value)}
        />
        <button className="button primary" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Search size={16} />
          )}
          Search
        </button>
      </form>
      <div className="fixture-date">
        <CalendarDays size={16} />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Fixture date"
        />
        <button
          className="text-button"
          disabled={busy}
          onClick={() =>
            void run<OfficialMatch[]>("fixtures", { date }, setFixtures)
          }
        >
          Browse this date
        </button>
      </div>
      {error ? (
        <div className="notice error">
          <AlertCircle size={18} />
          <p>{error}</p>
        </div>
      ) : null}
      {warning ? <div className="notice amber">{warning}</div> : null}
      <div className="search-results">
        {kind === "teams"
          ? teams.map((team) => (
              <button
                className="result-row"
                key={team.id}
                onClick={() =>
                  void run<OfficialMatch[]>(
                    "fixtures",
                    { teamId: team.id, season },
                    setFixtures,
                  )
                }
              >
                <span className="team-initial">
                  {team.shortName.slice(0, 3)}
                </span>
                <strong>{team.name}</strong>
                <span>
                  Fixtures <ArrowRight size={14} />
                </span>
              </button>
            ))
          : competitions.map((item) => (
              <button
                className="result-row"
                key={item.id}
                onClick={() =>
                  void run<OfficialMatch[]>(
                    "fixtures",
                    { competitionId: item.id, season },
                    setFixtures,
                  )
                }
              >
                <span className="team-initial">
                  <ShieldCheck size={20} />
                </span>
                <strong>
                  {item.name}
                  <small>{item.country}</small>
                </strong>
                <span>
                  {season} <ArrowRight size={14} />
                </span>
              </button>
            ))}
      </div>
      {fixtures.length ? (
        <>
          <h3 className="section-label">Fixtures · {fixtures.length}</h3>
          <div className="fixture-results">
            {fixtures.map((item) => (
              <button
                key={item.id}
                className={`fixture-row ${match?.id === item.id ? "active" : ""}`}
                onClick={() =>
                  void run<OfficialMatch>("match", { id: item.id }, setMatch)
                }
              >
                <span>
                  <small>
                    {new Date(item.kickoff).toLocaleDateString()} ·{" "}
                    {item.competition}
                  </small>
                  <strong>
                    {item.home.name}{" "}
                    <em>
                      {item.score.home ?? "–"} : {item.score.away ?? "–"}
                    </em>{" "}
                    {item.away.name}
                  </strong>
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </>
      ) : null}
      {match ? (
        <div className="match-detail">
          <div>
            <span className="eyebrow">{match.competition}</span>
            <h2>
              {match.home.name} vs {match.away.name}
            </h2>
            <p>
              {new Date(match.kickoff).toLocaleString()} ·{" "}
              {match.venue ?? "Venue unavailable"}
            </p>
          </div>
          <div className="lineup-summary">
            {[match.home, match.away].map((team) => {
              const lineup = match.lineups.find(
                (item) => item.teamId === team.id,
              );
              return (
                <div key={team.id}>
                  <strong>{team.name}</strong>
                  <span
                    className={`pill ${lineup?.status === "confirmed" ? "green" : "amber"}`}
                  >
                    {lineup?.status ?? "unavailable"}
                  </span>
                  <p>
                    {lineup?.formation ?? "No formation"} ·{" "}
                    {lineup?.starters.length ?? 0} starters ·{" "}
                    {lineup?.substitutes.length ?? 0} substitutes
                  </p>
                </div>
              );
            })}
          </div>
          <p className="muted">
            Provider: {match.provider} · Retrieved{" "}
            {new Date(match.retrievedAt).toLocaleString()}. Import creates an
            editable tactical copy; the provider record stays intact.
          </p>
          <button className="button primary" onClick={() => onImport(match)}>
            Use match in this project <ArrowRight size={16} />
          </button>
          {match.events.length ? (
            <details>
              <summary>{match.events.length} match events</summary>
              {match.events.map((event) => (
                <p key={event.id}>
                  {event.minute}′ · {event.type} · {event.player} {event.detail}
                </p>
              ))}
            </details>
          ) : null}
        </div>
      ) : (
        <div className="empty-state compact">
          <CalendarDays size={30} />
          <h3>Build from the match.</h3>
          <p>
            Find a club, competition or fixture to load lineups and match
            events.
          </p>
        </div>
      )}
    </div>
  );
}
