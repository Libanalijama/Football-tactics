# Football data integration

Bang On Tactics keeps provider data in `Project.officialMatch`, separate from editable tactical players, formations and scenes. Data imported from a provider is a timestamped snapshot; moving a marker, editing a name or substituting a tactical player does not rewrite that snapshot. The bundled scenarios are explicitly manual and do not represent real clubs or confirmed lineups.

## Implemented provider

`ApiFootballProvider` uses the official API-Football v3 HTTPS API through server-side `fetch`. No API keys or provider SDKs enter the browser bundle. The provider interface in `server/data/types.ts` defines `searchTeams`, `searchCompetitions`, `fixtures` and `match`; new adapters register in `server/data/index.ts`. IDs are namespaced (`api-football:33`) to prevent accidental collisions when another provider is added.

Set the following server environment variables in the Vercel project:

```
FOOTBALL_PROVIDER=api-football
FOOTBALL_API_KEY=<set privately in Vercel>
FOOTBALL_BADGES_LICENSED=false
```

Never prefix credentials with `VITE_`. The shared studio password/session gate protects every data request except configuration status. Keep Vercel Deployment Protection enabled for the operator deployment. No provider account, subscription, broadcast rights or credential has been provisioned by committing this integration.

The route is `GET /api/football`:

| `op`           | Filters                                           | `data`                                                               |
| -------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| `status`       | None                                              | `{configured,provider,badgesLicensed}` directly, without an envelope |
| `teams`        | `q` (at least 3 characters)                       | Normalized teams                                                     |
| `competitions` | optional `q` (at least 3 characters), `season`    | Competitions, available seasons, current/selected season             |
| `fixtures`     | `date`, or `season` plus `teamId`/`competitionId` | Matches without lineups/events                                       |
| `match`        | `id`                                              | Match with provider-reported lineups, bench and match events         |

Successful data responses use `{data,provider,retrievedAt,stale,warning?}`. Unconfigured data requests return HTTP 503 with `{error,message,configured:false}`. Unsupported or malformed records fail explicitly; the server does not fill missing football facts with fictional content. Scores and player numbers retain `null` when unavailable. Dates use UTC. Injury time is preserved in event detail text. The API-Football match team record does not include a short code, so the display uses a clearly derived three-letter abbreviation.

## Lineup provenance

API-Football documents fixture lineups as team sheets, including formation, starters, substitutes and grid coordinates, but its response has no explicit confirmation flag. This adapter therefore labels any supplied XI **provider-reported**, even when it has eleven names. Empty or missing team sheets are **unavailable**. The operator reviews a reported lineup before importing a tactical copy. This build never emits a `confirmed` lineup from API-Football. Grid coordinates are deliberately not treated as tracked player positions; applying an editable tactical formation is an editorial action.

Sportmonks supports predictive lineups on the same fixture endpoint. Any future Sportmonks adapter must inspect `metadata` / `LINEUP_CONFIRMED` and keep a false/missing flag distinct from confirmed data. Never infer confirmation from player count, a formation string, the kickoff time or a populated `lineups` array.

Historical fixtures and team sheets must be fetched by match and season. A current squad must never be presented as the historical match squad. Availability varies by competition, season and subscription. Player profiles, injuries, full career histories, tracking data and dedicated season-directory routes are not implemented in this adapter.

## Cache and failure handling

The process-local cache coalesces concurrent requests and holds at most 160 entries. Team and competition searches cache for 24 hours; fixture lists for 2 minutes; full matches for 1 minute. Failed refreshes may return a labelled stale reference snapshot for an additional 24 hours, or match data for an additional 15 minutes. The original retrieval timestamp remains visible; there is no indefinite stale fallback. Cache entries are cloned before returning so tactical edits cannot corrupt them. Badge license state forms part of the cache key, so revoking badge permission cannot reuse a licensed response.

Provider requests have an 8-second timeout, fixed origin and allowlisted paths. The route rejects unknown parameters and duplicate/array values, validates calendar dates and scope, accepts GET only, and applies a bounded per-instance 60-request/minute/IP limit. Provider error bodies and credentials are not returned to clients. This rate limit and cache are warm-instance conveniences, not distributed infrastructure or an uptime guarantee. Before broad public rollout, use a shared quota/rate store and monitor provider usage; the studio session gate remains required.

## Provider research and publishing rights

Researched against official sources on 12 November 2026. API access and the right to publish football data or visual assets are separate commercial questions.

| Provider          | Relevant capability                                                                                                                                               | Rights and operational constraints                                                                                                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API-Football      | Clubs, competitions/seasons/coverage, fixtures, scores, events, formation, starting XI, substitutes and player grid positions. Implemented adapter.               | Its terms do not grant competition publication/commercial rights; television and mass-media distribution may require additional rights-holder licenses. Logos and photos remain third-party property. Coverage varies.                            |
| Sportmonks        | Fixture relationships expose participants, scores, events, player lineups, formations and confirmation metadata. Suitable to evaluate for a broadcaster contract. | Predictive and confirmed lineups share endpoints, requiring the confirmation metadata check. Archive depth varies; older seasons may require an add-on. Logo/photo permission must be arranged separately. No adapter or subscription is bundled. |
| football-data.org | v4 match records include formations, lineup, bench, goals, cards and substitutions; competition/season filters. Useful alternative for selected coverage.         | Logo/photo owner consent is required; subscription terms restrict use of obtained data after cancellation. Confirm plan coverage and historical depth. No adapter or subscription is bundled.                                                     |

`FOOTBALL_BADGES_LICENSED` defaults to false: badge URLs are removed on the server. Enable it only after Bang On Sports has established the necessary asset rights for its intended uses. Even when enabled, only approved API-Sports HTTPS media hosts pass normalization. A data subscription alone is not a guarantee of broadcast or trademark rights. Final competition, territory, distribution, caching, archive, attribution and image rights should be specified in the chosen commercial agreement.

Official references:

- [API-Football v3 documentation](https://www.api-football.com/documentation-v3) and [terms](https://www.api-football.com/terms).
- [Sportmonks lineup/formation tutorial](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/lineups-and-formations), [API includes](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes), and [FAQ on images and historical access](https://www.sportmonks.com/faq/).
- [football-data.org v4 match reference](https://docs.football-data.org/general/v4/match.html), [unfolding lineups/events](https://docs.football-data.org/general/v4/policies.html), and [terms](https://www.football-data.org/about).
