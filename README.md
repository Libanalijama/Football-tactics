# Bang On Tactics

Football analysis and broadcast presentation for Bang On Sports. This independent application uses only Libanalijama/Football-tactics for its source.

## Start

Use Node.js 22 or later.

    npm ci
    npm run dev

The local server includes the public match-data route. Tactical editing, media, project saves and exports work without an account. Private cloud snapshots require the Vercel session/project functions.

## Match discovery — no key or account

Open Matches to load nearby Premier League fixtures automatically. Competition buttons include the Premier League, Champions League, LaLiga, Bundesliga, Serie A, Ligue 1, Championship and MLS. Choose recent/upcoming dates or filter the visible fixtures by club.

- ESPN public endpoints supply scores, available reported starting XIs, substitutes, formations and events without an API key.
- The explicit Openfootball option supplies CC0 public-domain fixtures/results. It does not supply lineups.
- Missing information stays unavailable. Importing a match creates an editable tactical copy while preserving the original provider record.
- ESPN public access is not a grant of commercial broadcast or badge rights. The source selector and provider guide distinguish its terms from the CC0 fixture option. See [football-data.md](docs/football-data.md).

## Shapes, actions and movement

The Actions panel prepares low blocks, mid blocks, high presses and build-out shapes. Choose a formation, then drop, advance or shift a team by a measured distance, or narrow/widen the unit. Role-aware positioning mirrors correctly for home and away attacking directions.

Select a player to give them the ball, carry forward, run or receive a pass. Actions automatically create start and finish keyframes. Team polygons, defensive lines, calibrated pitch distances, running trails and ball possession follow playback.

Movement step advances the timeline two seconds: drag players to the next position and the movement is captured automatically. Additional position keyframes remain available. Substitutions use a player-off/player-on chooser and preserve the playing position, defensive group and ball route.

New projects start with one scene and unnamed numbered manual tokens. No fake names, substitute lists or demonstration annotations are supplied. Earlier demonstration text is cleaned without removing custom work.

## Drawing, pictures and footage

Draw movement arrows, dashed passes, curved runs, freehand marks, hatched zones, ellipses, spotlights, text, vision cones, connected shapes, manual heat zones and distance guides. Pitch distances use 105 × 68 metres; footage guides are uncalibrated.

Upload a still or video, seek footage and freeze a frame. Move pictures, drag corner handles to resize, zoom, rotate, fit/fill or reset. The studio, clean output and PNG/WebM exports share the same picture geometry. Fullscreen keeps tools, picture controls and uploads available.

Media stays in this browser's IndexedDB. Supported playback depends on the browser's installed codecs. SVG uploads are excluded.

## Programme, persistence and exports

Take live publishes a separate scene snapshot to the clean output. Prepared edits remain off air until the next take. Presenter view supplies notes, scene stepping, play/pause and blackout. Keep operator, output and presenter windows on the same origin and browser profile on one computer.

Local projects autosave. Export/import validated project JSON, clean SVG, high-resolution PNG or silent real-time WebM. JSON/cloud snapshots store media references rather than original footage. Reuploading the same original file reconnects its references and retains saved positions. Keep original files and exported backups.

Private cloud snapshots use a connected private Vercel Blob store and a shared studio password. There is no remote production bus, multi-user collaboration or enterprise permission system.

## Deployment

Vercel project: bang-on-tactics. Framework: Vite. Build: npm run build. Output: dist. Node.js: 24.

The public-football function requires no secret. For private cloud snapshots, configure STUDIO_PASSWORD and the private store connection BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID. FOOTBALL_BADGES_LICENSED defaults to false.

The older optional API-Football adapter remains server-only and requires FOOTBALL_API_KEY plus a studio session. It is not used by the default match browser.

## Checks

    npm run check
    npm test
    npm run build
    npm run test:e2e

Playwright uses installed Chrome on macOS and Chromium elsewhere. On Linux, install Chromium with npx playwright install --with-deps chromium.

See [architecture](docs/architecture.md) and [verification](docs/verification.md) for boundaries and recorded evidence. Production capture, rights clearance and provider coverage still need checking for the broadcaster's intended use.
