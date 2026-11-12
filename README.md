# Bang On Tactics

A new football analysis studio for Bang On Sports. This repository is a greenfield application with its own architecture, tactical renderer and project format. It does not reuse an earlier tactics application or connect to another code repository.

The studio combines an editable SVG tactical board, still/video telestration, saved scenes and a separate programme output. The dark operator workspace keeps the pitch central, with coral and ice-blue teams and a lime analysis accent. The attached design references informed the visual direction; no other broadcaster's graphics are included.

## Run the studio

Use Node.js 22 or later and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Tactical editing, local media, local saves, imports/exports and same-browser programme output work without provider credentials. The development server serves the browser application only; it does **not** run `/api` server functions.

For authenticated cloud storage and live football data, use the Vercel development runtime after linking this repository to its own Vercel project and configuring the required server environment variables:

```sh
npx vercel link
npx vercel env pull .env.local
npx vercel dev
```

Do not commit `.env.local` or copy credentials into client code. See [deployment requirements](#deployment) and [football provider setup](docs/football-data.md).

## Main workflows

1. **Prepare a tactical scene.** Rename the project and scene, edit the manual home/away teams and players, choose a formation and drag players into position. Manage starters and substitutes without changing an imported official match snapshot.
2. **Explain the play.** Draw movement arrows, dashed passes, curved arrows, freehand marks, hatched zones, ellipses, highlights and text. Select and reposition annotations; double-click text to edit it. Use undo/redo to revise work.
3. **Animate movement.** Capture player positions at points on the scene timeline, move the playhead and capture the next shape. Playback interpolates positions between keyframes. Keep scene timing and editorial notes with the analysis.
4. **Telestrate media.** Import a supported still or video, use it as the scene background, seek/pause footage and draw over it. Uploaded media stays in this browser's IndexedDB rather than being sent to a third party. Supported containers do not guarantee that every codec will play in every browser.
5. **Prepare and present.** Select a scene in the operator workspace and take it to programme. Open `/output` for a clean picture or `/presenter` for scene controls and notes. The output receives an explicit programme snapshot, allowing preparation to continue separately. Keep both windows on the same deployment origin and in the same browser profile.
6. **Keep and export work.** Save and reopen local projects; export/import validated `.bangontactics.json` files. Export a clean SVG or PNG and record browser-generated WebM animation where supported. Private cloud project snapshots are available after secure storage is configured.
7. **Import real match data.** Connect API-Football on the server, search clubs or competitions, filter fixtures by date/season and load a match. Review the provider-reported team sheet before importing tactical players. Unavailable data stays unavailable; manual scenarios never masquerade as confirmed real teams.

Programme shortcuts: `F` enters fullscreen. In presenter mode, left/right arrows step scenes, Space toggles playback and `B` toggles blackout. The studio window must remain open to receive presenter commands.

## Storage and portability

The versioned project document contains scene structure, team settings, manual players, annotations, keyframes, media references and optional official match data. IndexedDB stores projects and source media locally; localStorage remembers the recent project and the latest programme snapshot. A browser failure or cleared site data can remove local work, so export backups for important productions.

Project JSON exports and private cloud project saves contain **media metadata and references, not the source image/video bytes**. Keep original footage and reattach it on another browser/device. SVG exports contain vector graphics/annotations; PNG captures the current composite with loaded media. WebM recording is browser-generated and real-time; it does not mix or export source audio. It is not a server-rendered broadcast codec pipeline.

Cloud snapshots use a **private Vercel Blob store** behind the studio session gate. This build does not provision a database subscription, Blob store, provider account or licensed football feed merely by being installed. It has no multi-user collaboration, per-user roles or concurrent-edit conflict resolution.

## Deployment

Create or link a Vercel project for **only** `Libanalijama/Football-tactics`. Framework: Vite. Build command: `npm run build`. Output directory: `dist`. The `api/` directory contains Node.js server functions; `vercel.json` routes `/output` and `/presenter` to the browser application.

Configure server-only variables as required:

| Variable                                                                       | Purpose                                                                                                                    |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `STUDIO_PASSWORD`                                                              | Shared studio password for protected server features. Use a long, unique value. Changing it invalidates existing sessions. |
| `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` with appropriate Vercel credentials | Access to the connected **private** Blob store for project snapshots. Never expose the token to the browser.               |
| `FOOTBALL_API_KEY`                                                             | API-Football server credential. Required only for live provider requests.                                                  |
| `FOOTBALL_PROVIDER`                                                            | Optional; currently `api-football` is the installed adapter.                                                               |
| `FOOTBALL_BADGES_LICENSED`                                                     | Defaults to false. Only enable after the required visual-asset rights are cleared.                                         |

Cloud endpoints return an explicit unavailable state when their prerequisites are absent. Local tactical work continues. Keep operator access protected in the deployment configuration. Authentication is a shared workspace password with a signed twelve-hour HttpOnly, SameSite cookie, same-origin mutation checks and per-instance login throttling; it is not an enterprise identity or permissions system.

An API subscription does not automatically grant television, mass-media, competition, crest or player-photo publishing rights. API-Football's terms explicitly distinguish API access from publishing rights. Obtain the rights appropriate to Bang On Sports' distribution before using provider data or assets on air. See the [provider research and boundaries](docs/football-data.md).

## Verification

```sh
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit and contract tests exercise pitch geometry, animation, safe project/media validation, provider normalization/failure handling and session/origin guards. Browser workflow tests verify the studio interactions available in the current build. The production build type-checks both the browser code and server functions. Real provider responses, deployed Blob permissions and broadcast capture performance still require validation in the configured production environment.

See [architecture](docs/architecture.md) for component boundaries, data provenance and known limits.
