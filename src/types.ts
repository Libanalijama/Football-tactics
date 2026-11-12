export type Point = { x: number; y: number };
export type Tool =
  | "select"
  | "arrow"
  | "pass"
  | "curve"
  | "freehand"
  | "zone"
  | "ellipse"
  | "highlight"
  | "text"
  | "erase";
export type TeamSide = "home" | "away";
export interface Player extends Point {
  id: string;
  team: TeamSide;
  number: number;
  name: string;
  role: string;
  onPitch: boolean;
  highlighted?: boolean;
}
export interface Annotation {
  id: string;
  type: Exclude<Tool, "select" | "erase">;
  points: Point[];
  color: string;
  width: number;
  text?: string;
}
export interface Keyframe {
  id: string;
  time: number;
  positions: Record<string, Point>;
}
export interface MediaAsset {
  id: string;
  name: string;
  kind: "image" | "video";
  mime: string;
  size: number;
}
export interface Scene {
  id: string;
  name: string;
  subtitle: string;
  players: Player[];
  annotations: Annotation[];
  keyframes: Keyframe[];
  duration: number;
  mediaId?: string;
  mediaTime: number;
  background: "pitch" | "media";
  pitchTheme: "stadium" | "midnight";
  showNames: boolean;
  showNumbers: boolean;
  showGrid: boolean;
  camera: "full" | "half";
  notes: string;
  sourceMatchId?: string;
}
export interface TeamSettings {
  name: string;
  shortName: string;
  color: string;
  formation: string;
  badge?: string;
}
export interface OfficialPlayer {
  id: string;
  name: string;
  number: number | null;
  position: string | null;
}
export interface OfficialLineup {
  teamId: string;
  status: "confirmed" | "provider-reported" | "predicted" | "unavailable";
  formation: string | null;
  starters: OfficialPlayer[];
  substitutes: OfficialPlayer[];
}
export interface OfficialTeam {
  id: string;
  name: string;
  shortName: string;
  badge?: string;
}
export interface OfficialMatch {
  id: string;
  provider: string;
  retrievedAt: string;
  kickoff: string;
  competition: string;
  season: string;
  venue: string | null;
  status: string;
  home: OfficialTeam;
  away: OfficialTeam;
  score: { home: number | null; away: number | null };
  lineups: OfficialLineup[];
  events: Array<{
    id: string;
    minute: number;
    type: string;
    teamId: string;
    player: string;
    detail?: string;
  }>;
}
export interface Project {
  version: 1;
  id: string;
  name: string;
  updatedAt: string;
  home: TeamSettings;
  away: TeamSettings;
  scenes: Scene[];
  activeSceneId: string;
  assets: MediaAsset[];
  officialMatch?: OfficialMatch;
  badgesCleared: boolean;
}
export interface ProgramState {
  projectId: string;
  scene: Scene;
  home: TeamSettings;
  away: TeamSettings;
  playing: boolean;
  startedAt: number;
  time: number;
  blackout: boolean;
  transition: "cut" | "mix";
  revision: number;
}
