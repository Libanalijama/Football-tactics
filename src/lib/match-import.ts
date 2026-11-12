import type {
  OfficialLineup,
  OfficialMatch,
  OfficialPlayer,
  Player,
  Project,
  Scene,
  TeamSide,
} from "../types";
import { formationPositions } from "./formations";

const SIDES = ["home", "away"] as const;
const MAX_PLAYERS = 80;

function tacticalFormation(lineup: OfficialLineup | undefined): string {
  if (lineup?.formation) {
    try {
      formationPositions(lineup.formation, "home");
      return lineup.formation;
    } catch {
      // Unknown provider formations remain untouched in the official snapshot.
    }
  }
  return "4-3-3";
}

function tacticalPlayer(
  source: OfficialPlayer,
  side: TeamSide,
  index: number,
  onPitch: boolean,
  point: { x: number; y: number },
): Player {
  return {
    // IDs are local to a scene. Editorial IDs never alias provider identities.
    id: `import:${side}:${onPitch ? "starter" : "bench"}:${index}`,
    team: side,
    name: source.name,
    number: source.number ?? 0,
    role: source.position ?? "",
    onPitch,
    ...point,
  };
}

/**
 * Import a normalized, operator-reviewed team sheet without mutating its facts.
 * The result has no input object references and no browser or storage effects.
 * Zero is the editor's unknown-number sentinel; official numbers retain null.
 */
export function importOfficialMatch(
  project: Project,
  activeScene: Scene,
  match: OfficialMatch,
): Project {
  const sceneIndex = project.scenes.findIndex(
    (scene) => scene.id === activeScene.id,
  );
  if (sceneIndex < 0)
    throw new Error("The target scene is not in this project.");

  const result = structuredClone(project);
  const { mediaId: _mediaId, ...scene } = structuredClone(activeScene);
  const players: Player[] = [];
  const benches: Record<TeamSide, OfficialPlayer[]> = { home: [], away: [] };

  for (const side of SIDES) {
    const lineup = match.lineups.find((item) => item.teamId === match[side].id);
    const formation = tacticalFormation(lineup);
    const positions = formationPositions(formation, side);
    const { badge: _oldBadge, ...settings } = result[side];
    result[side] = {
      ...settings,
      name: match[side].name,
      shortName: match[side].shortName.slice(0, 16),
      formation,
      ...(match[side].badge ? { badge: match[side].badge } : {}),
    };

    // A missing sheet never inherits the manual scenario's placeholder roster.
    if (!lineup || lineup.status === "unavailable") continue;
    players.push(
      ...lineup.starters
        .slice(0, 11)
        .map((player, index) =>
          tacticalPlayer(player, side, index, true, positions[index]),
        ),
    );
    benches[side] = lineup.substitutes.slice(0, 40);
  }

  // Prioritize both starting XIs, then allocate the remaining bench fairly.
  // The complete provider benches remain intact in officialMatch.
  for (let index = 0; index < 40 && players.length < MAX_PLAYERS; index++) {
    for (const side of SIDES) {
      const source = benches[side][index];
      if (source && players.length < MAX_PLAYERS)
        players.push(
          tacticalPlayer(source, side, index, false, { x: 50, y: 50 }),
        );
    }
  }

  result.officialMatch = structuredClone(match);
  result.activeSceneId = activeScene.id;
  result.scenes[sceneIndex] = {
    ...scene,
    name: `${match.home.shortName} vs ${match.away.shortName}`,
    subtitle: `${match.competition} · ${match.season}`,
    players,
    annotations: [],
    keyframes: [],
    background: "pitch",
    mediaTime: 0,
    sourceMatchId: match.id,
  };
  return result;
}
