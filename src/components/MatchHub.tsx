import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  CalendarDays,
  AlertCircle,
  ArrowRight,
  LoaderCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Trophy,
  Shield,
} from "lucide-react";
import type { OfficialMatch } from "../types";

type Envelope<T> = {
  data: T;
  provider: string;
  retrievedAt: string;
  stale: boolean;
  warning?: string;
};
type Window = "nearby" | "recent" | "upcoming" | "day";
const LEAGUES = [
  { id: "eng.1", name: "Premier League" },
  { id: "uefa.champions", name: "Champions League" },
  { id: "esp.1", name: "LaLiga" },
  { id: "ger.1", name: "Bundesliga" },
  { id: "ita.1", name: "Serie A" },
  { id: "fra.1", name: "Ligue 1" },
  { id: "eng.2", name: "Championship" },
  { id: "usa.1", name: "MLS" },
];
const WINDOWS: Array<{ id: Window; name: string }> = [
  { id: "nearby", name: "Nearby" },
  { id: "recent", name: "Recent" },
  { id: "upcoming", name: "Upcoming" },
  { id: "day", name: "On a date" },
];
function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return localDate(value);
}
function range(date: string, window: Window) {
  return {
    from: shiftDate(
      date,
      window === "upcoming" || window === "day"
        ? 0
        : window === "recent"
          ? -14
          : -7,
    ),
    to: shiftDate(
      date,
      window === "recent" || window === "day"
        ? 0
        : window === "upcoming"
          ? 14
          : 7,
    ),
  };
}
async function publicRequest<T>(
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<Envelope<T>> {
  const response = await fetch(
    `/api/public-football?${new URLSearchParams(params)}`,
    { signal },
  );
  if (
    !(response.headers.get("content-type") ?? "").includes("application/json")
  )
    throw new Error(
      "Match data could not be reached. Refresh the match browser and try again.",
    );
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.message ?? "Matches could not be loaded.");
  return body as Envelope<T>;
}
function sourceName(provider: string) {
  return provider === "openfootball"
    ? "Openfootball · CC0 fixture archive"
    : "ESPN public match data";
}
function kickoffLabel(value: string): string {
  if (value.length <= 10) return "Kickoff time unavailable";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function lineupLabel(status: string | undefined): string {
  return status === "confirmed"
    ? "Confirmed"
    : status === "predicted"
      ? "Predicted"
      : status === "provider-reported"
        ? "Reported XI"
        : "Unavailable";
}

export function MatchHub({
  onImport,
}: {
  onImport: (match: OfficialMatch) => void;
  onUnlock?: () => void;
}) {
  const [league, setLeague] = useState("eng.1");
  const [source, setSource] = useState<"espn" | "openfootball">("espn");
  const [window, setWindow] = useState<Window>("nearby");
  const [date, setDate] = useState(localDate);
  const [query, setQuery] = useState("");
  const [fixtures, setFixtures] = useState<OfficialMatch[]>([]);
  const [match, setMatch] = useState<OfficialMatch>();
  const [busy, setBusy] = useState(true);
  const [detailBusy, setDetailBusy] = useState<string>();
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [provider, setProvider] = useState("espn");
  const [refresh, setRefresh] = useState(0);
  const detailRequest = useRef<AbortController | null>(null);
  const detailGeneration = useRef(0);
  const dates = useMemo(() => range(date, window), [date, window]);

  useEffect(() => {
    const request = new AbortController();
    detailRequest.current?.abort();
    detailGeneration.current++;
    setMatch(undefined);
    setDetailBusy(undefined);
    setBusy(true);
    setError("");
    setWarning("");
    setFixtures([]);
    publicRequest<OfficialMatch[]>(
      { op: "fixtures", league, source, ...dates },
      request.signal,
    )
      .then((result) => {
        if (request.signal.aborted) return;
        setFixtures(result.data);
        setProvider(result.provider);
        setWarning(
          result.warning ??
            (result.stale
              ? "Showing a previously retrieved match snapshot."
              : ""),
        );
      })
      .catch((reason) => {
        if (!request.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Matches could not be loaded.",
          );
      })
      .finally(() => {
        if (!request.signal.aborted) setBusy(false);
      });
    return () => request.abort();
  }, [league, source, dates, refresh]);
  useEffect(() => () => detailRequest.current?.abort(), []);

  const filtered = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return fixtures.filter((item) => {
      const names =
        `${item.home.name} ${item.away.name} ${item.home.shortName} ${item.away.shortName}`.toLocaleLowerCase();
      return terms.every((term) => names.includes(term));
    });
  }, [fixtures, query]);
  const groups = useMemo(() => {
    const result = new Map<string, OfficialMatch[]>();
    for (const fixture of filtered) {
      const day = fixture.kickoff.slice(0, 10);
      result.set(day, [...(result.get(day) ?? []), fixture]);
    }
    return [...result.entries()];
  }, [filtered]);

  async function openMatch(id: string) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    const generation = ++detailGeneration.current;
    setDetailBusy(id);
    setError("");
    setMatch(undefined);
    try {
      const result = await publicRequest<OfficialMatch>(
        { op: "match", id },
        controller.signal,
      );
      if (generation !== detailGeneration.current || controller.signal.aborted)
        return;
      setMatch(result.data);
      if (result.warning || result.stale)
        setWarning(
          result.warning ??
            "This match is a cached snapshot. Check its retrieval time.",
        );
    } catch (reason) {
      if (!controller.signal.aborted && generation === detailGeneration.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "The team sheet could not be loaded.",
        );
    } finally {
      if (generation === detailGeneration.current) setDetailBusy(undefined);
    }
  }
  const starters =
    match?.lineups.reduce((count, sheet) => count + sheet.starters.length, 0) ??
    0;

  return (
    <div className="match-hub">
      <div className="match-browser-intro">
        <div>
          <span className="eyebrow">MATCH CENTRE</span>
          <h3>Matches</h3>
          <p className="muted">
            Browse fixtures and available team sheets. No account or API key.
          </p>
        </div>
        <Trophy size={25} aria-hidden="true" />
      </div>
      <div
        className="match-source-choices"
        role="group"
        aria-label="Match data source"
      >
        <button
          type="button"
          className={`button small ${source === "espn" ? "primary" : ""}`}
          aria-pressed={source === "espn"}
          onClick={() => setSource("espn")}
        >
          ESPN · Key-free team sheets
        </button>
        <button
          type="button"
          className={`button small ${source === "openfootball" ? "primary" : ""}`}
          aria-pressed={source === "openfootball"}
          onClick={() => {
            setSource("openfootball");
            if (["uefa.champions", "usa.1"].includes(league))
              setLeague("eng.1");
          }}
        >
          Openfootball · CC0 fixtures
        </button>
      </div>
      <div className="league-chips" role="group" aria-label="Competition">
        {LEAGUES.map((item) => (
          <button
            type="button"
            key={item.id}
            className={league === item.id ? "active" : ""}
            aria-pressed={league === item.id}
            disabled={
              source === "openfootball" &&
              ["uefa.champions", "usa.1"].includes(item.id)
            }
            onClick={() => setLeague(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div
        className="match-window-tabs"
        role="group"
        aria-label="Fixture window"
      >
        {WINDOWS.map((item) => (
          <button
            type="button"
            key={item.id}
            className={window === item.id ? "active" : ""}
            aria-pressed={window === item.id}
            onClick={() => setWindow(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className="match-browse-controls">
        <div className="fixture-date">
          <button
            type="button"
            className="icon-button small"
            aria-label="Previous fixture day"
            onClick={() => {
              setDate(shiftDate(date, -1));
              setWindow("day");
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <CalendarDays size={16} aria-hidden="true" />
          <input
            type="date"
            aria-label="Fixture date"
            value={date}
            onChange={(event) => {
              if (event.target.value) {
                setDate(event.target.value);
                setWindow("day");
              }
            }}
          />
          <button
            type="button"
            className="icon-button small"
            aria-label="Next fixture day"
            onClick={() => {
              setDate(shiftDate(date, 1));
              setWindow("day");
            }}
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setDate(localDate());
              setWindow("nearby");
            }}
          >
            Today
          </button>
        </div>
        <label className="match-club-filter">
          <span className="section-label">FIND A CLUB</span>
          <span className="input-icon match-club-search">
            <Search size={16} aria-hidden="true" />
            <input
              aria-label="Filter matches by club"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </span>
        </label>
        <button
          type="button"
          className="icon-button"
          aria-label="Refresh fixtures"
          onClick={() => setRefresh((value) => value + 1)}
          disabled={busy}
        >
          <RefreshCw size={16} className={busy ? "spin" : ""} />
        </button>
      </div>
      <div className="match-results-heading">
        <span className="section-label">
          {LEAGUES.find((item) => item.id === league)?.name}
        </span>
        <span className="muted">
          {busy ? "Finding matches…" : `${filtered.length} matches`} ·{" "}
          {dates.from === dates.to ? dates.from : `${dates.from} – ${dates.to}`}
        </span>
      </div>
      {error ? (
        <div className="notice error" role="alert">
          <AlertCircle size={18} />
          <p>{error}</p>
          <button
            type="button"
            className="text-button"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : null}
      {warning ? (
        <div className="notice amber">
          <AlertCircle size={16} />
          <p>{warning}</p>
        </div>
      ) : null}
      {busy ? (
        <div className="empty-state compact" role="status">
          <LoaderCircle className="spin" size={26} />
          <h3>Loading matches</h3>
          <p>Loading fixtures from the public match source.</p>
        </div>
      ) : groups.length ? (
        <div className="fixture-results">
          {groups.map(([day, items]) => (
            <section className="fixture-group" key={day}>
              <h4>
                {new Date(`${day}T12:00:00`).toLocaleDateString([], {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </h4>
              {items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`fixture-row ${match?.id === item.id ? "active" : ""}`}
                  aria-label={`${item.home.name} versus ${item.away.name}`}
                  onClick={() => void openMatch(item.id)}
                >
                  <span>
                    <small>
                      {kickoffLabel(item.kickoff)} · {item.status}
                    </small>
                    <strong>
                      {item.home.name}
                      <em>
                        {item.score.home ?? "–"} : {item.score.away ?? "–"}
                      </em>
                      {item.away.name}
                    </strong>
                  </span>
                  {detailBusy === item.id ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <ArrowRight size={17} />
                  )}
                </button>
              ))}
            </section>
          ))}
        </div>
      ) : !error ? (
        <div className="empty-state compact">
          <CalendarDays size={28} />
          <h3>
            {query
              ? "No clubs match that search."
              : "No fixtures in this window."}
          </h3>
          <p>
            {query
              ? "Try the full club name or clear the search."
              : "Choose Nearby, another date or another competition."}
          </p>
          {query ? (
            <button
              type="button"
              className="text-button"
              onClick={() => setQuery("")}
            >
              Clear club search
            </button>
          ) : null}
        </div>
      ) : null}
      {detailBusy ? (
        <div className="notice" role="status">
          <LoaderCircle className="spin" size={18} />
          <p>Loading the match and available team sheets…</p>
        </div>
      ) : null}
      {match ? (
        <div className="match-detail" aria-label="Selected match details">
          <div>
            <span className="eyebrow">{match.competition}</span>
            <h2>
              {match.home.name} vs {match.away.name}
            </h2>
            <p>
              {new Date(
                match.kickoff.length <= 10
                  ? `${match.kickoff}T12:00:00`
                  : match.kickoff,
              ).toLocaleDateString([], {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}{" "}
              · {kickoffLabel(match.kickoff)}
              {match.venue ? ` · ${match.venue}` : ""}
            </p>
          </div>
          <div className="lineup-summary">
            {[match.home, match.away].map((team) => {
              const lineup = match.lineups.find(
                (item) => item.teamId === team.id,
              );
              return (
                <div key={team.id} className="match-team-sheet">
                  <div className="match-team-sheet-heading">
                    {team.badge ? (
                      <img src={team.badge} alt="" width="28" height="28" />
                    ) : (
                      <Shield size={21} aria-hidden="true" />
                    )}
                    <strong>{team.name}</strong>
                    <span
                      className={`pill ${lineup?.status === "confirmed" ? "green" : "amber"}`}
                    >
                      {lineupLabel(lineup?.status)}
                    </span>
                  </div>
                  <p>
                    {lineup?.formation ?? "Formation unavailable"} ·{" "}
                    {lineup?.starters.length ?? 0} starters ·{" "}
                    {lineup?.substitutes.length ?? 0} substitutes
                  </p>
                  {lineup?.starters.length ? (
                    <ol className="match-team-roster">
                      {lineup.starters.map((player) => (
                        <li key={player.id}>
                          <span>{player.number ?? "–"}</span>
                          {player.name}
                          <small>{player.position ?? ""}</small>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="muted">
                      No starting XI has been supplied for this match.
                    </p>
                  )}
                  {lineup?.substitutes.length ? (
                    <details>
                      <summary>
                        Substitute bench · {lineup.substitutes.length}
                      </summary>
                      <ul className="match-team-roster">
                        {lineup.substitutes.map((player) => (
                          <li key={player.id}>
                            <span>{player.number ?? "–"}</span>
                            {player.name}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              );
            })}
          </div>
          <p className="hint">
            {starters
              ? "Team sheets are provider-reported. Import creates an editable tactical copy and preserves the source record."
              : "Match details can be imported now. The tactical board stays empty until a team sheet is available or you add players."}
          </p>
          <button
            type="button"
            className="button primary"
            onClick={() => onImport(match)}
          >
            {starters ? "Use match and team sheets" : "Use match details"}
            <ArrowRight size={16} />
          </button>
          {match.events.length ? (
            <details className="match-events">
              <summary>{match.events.length} match events</summary>
              {match.events.map((event) => (
                <p key={event.id}>
                  {event.minute}′ · {event.type} · {event.player}
                  {event.detail ? ` · ${event.detail}` : ""}
                </p>
              ))}
            </details>
          ) : null}
          <p className="match-source-note">
            {sourceName(match.provider)} · Retrieved{" "}
            {new Date(match.retrievedAt).toLocaleString()}.
          </p>
        </div>
      ) : null}
      <p className="match-source-note">
        {sourceName(provider)} · No API key.{" "}
        {provider === "openfootball" ? (
          <a
            href="https://github.com/openfootball/football.json"
            target="_blank"
            rel="noreferrer"
          >
            Public-domain fixture data
          </a>
        ) : (
          <>
            <a
              href="https://disneytermsofuse.com/english/"
              target="_blank"
              rel="noreferrer"
            >
              Source terms
            </a>{" "}
            apply; public access does not include broadcast or badge rights.
          </>
        )}
      </p>
    </div>
  );
}
