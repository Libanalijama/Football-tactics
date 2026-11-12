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
  | "heat"
  | "cone"
  | "link"
  | "distance"
  | "text"
  | "erase"
  | "media";
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
  type: Exclude<Tool, "select" | "erase" | "media">;
  points: Point[];
  color: string;
  width: number;
  text?: string;
}
export interface Keyframe {
  id: string;
  time: number;
  positions: Record<string, Point>;
  ball?: Point;
  ballCarrierId?: string;
}
export interface TacticalState {
  activeTeam: TeamSide;
  showShape: boolean;
  showDistances: boolean;
  showTrails: boolean;
  showLines: boolean;
  showBall: boolean;
  ball: Point & { carrierId?: string };
  formation?: string;
  block?: "low" | "mid" | "high" | "build-out" | "custom";
  lineGroups?: string[][];
}
export interface MediaTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  fit: "contain" | "cover";
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
  mediaTransform?: MediaTransform;
  background: "pitch" | "media";
  pitchTheme: "stadium" | "midnight";
  showNames: boolean;
  showNumbers: boolean;
  showGrid: boolean;
  camera: "full" | "half";
  notes: string;
  sourceMatchId?: string;
  tactics?: TacticalState;
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
