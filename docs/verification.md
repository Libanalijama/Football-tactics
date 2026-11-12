# Verification record

Verified on 12 November 2026 using Node.js 24 and desktop Chrome.

## Automated coverage

| Area                                    | Evidence                                                                                                                                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project validation and media boundaries | 10 unit tests validate round-trip import, unsupported versions, invalid coordinates, duplicate IDs, missing assets, unsafe media references, file restrictions and exact media reattachment.                                              |
| Private project API                     | 10 unit tests exercise signed-session enforcement, same-origin writes, missing storage, private reads/writes, corrupt documents, identity mismatch, body limits and upstream failure handling. Blob operations are mocked in these tests. |
| Football normalization and caching      | 11 unit tests cover provider normalization and service behavior.                                                                                                                                                                          |
| Official match import                   | 8 unit tests verify official-data isolation, empty unavailable lineups, shirt-number handling, roster bounds, unknown formations, badge cleanup and independent scenes.                                                                   |
| Authentication                          | 10 unit tests cover session signatures, expiry, cookie properties and origin checks.                                                                                                                                                      |
| Tactical positioning and animation      | 11 unit tests cover formations, coordinate constraints and interpolation.                                                                                                                                                                 |
| SVG renderer                            | 3 unit tests cover normalized geometry and graphic rendering.                                                                                                                                                                             |
| JSON backup and restoration             | Browser test downloads a full project, imports a modified backup, and confirms restoration after a page reload.                                                                                                                           |
| Broadcast artwork export                | Browser test validates the PNG signature and 2400 × 1560 dimensions, parses the SVG as valid XML, checks all 22 players, and confirms edit handles are removed.                                                                           |
| Media image export                      | Browser test uploads a generated still, reloads the studio, exports PNG and verifies the underlying image is present through sampled pixels.                                                                                              |
| Animated video export                   | Browser test creates player keyframes at 0 and 1 second, records WebM, decodes the result at 1200 × 780 and checks that the first and later frames differ.                                                                                |
| Original-media reattachment             | Browser test removes the local video blob, reloads the missing-media project, reuploads the original and verifies asset identity, deduplicated metadata and the saved frozen frame are preserved.                                         |

Current recorded result: **63 unit tests and 11 browser tests passed**.

The six operator/broadcast browser tests additionally verify:

- Player dragging, undo/redo and autosave after reload.
- Tactical drawing, deletion and undo.
- Keyframe interpolation/playback and independent scenes.
- A clean programme output that stays unchanged until the next take, plus blackout.
- Still-image annotation, media persistence and clean output.
- Video seeking, freezing a frame and restoring that position after reload.

## Repeatable checks

```sh
npm ci
npm test
npm run check
npm run build
npm run test:e2e
```

The Playwright configuration starts or reuses the development server. It uses installed Chrome on macOS and Chromium elsewhere. Install Chromium first on a new Linux environment with `npx playwright install --with-deps chromium`. Set `BASE_URL` to run against an already running deployment.

The GitHub workflow runs locked dependency installation, unit tests, TypeScript checks and a production build. It does not provision accounts or publish releases.

## Deployment-dependent verification

These checks require the deployment's own credentials and cannot be replaced by unit fixtures:

- Unlock the studio with its configured password, save a private cloud snapshot and restore it.
- Configure the licensed football provider and confirm real fixture, event, team-sheet and season coverage for the purchased subscription.
- Confirm permission to display club badges and use match footage in the intended broadcast.
- Check clean output in the actual recording or broadcast application and on the production display.

Manual tactical scenarios are labeled as manual. Missing or unconfigured football data is not replaced with invented match results or confirmed lineups.

## Practical boundaries

- Project JSON and private cloud snapshots contain scene data and asset metadata; original images and video are held in the browser's IndexedDB database and need reattaching on another device. Uploading the original with the same name, MIME type and size reconnects its existing scene references and retains saved frame positions.
- Programme output and presenter controls coordinate within the same origin and browser on one computer. Cross-device studio control is outside this release.
- WebM exports are silent, real-time browser recordings. Image exports include the current video frame. Supported codecs depend on the browser.
- Browser storage can be cleared or evicted. Keep exported project backups and the original media files.
