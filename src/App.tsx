import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  ArrowUpRightFromSquare,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  Circle,
  Clapperboard,
  Cloud,
  Copy,
  Download,
  Ellipsis,
  Expand,
  Eye,
  Film,
  FolderOpen,
  Grid2X2,
  HelpCircle,
  ImagePlus,
  Layers,
  LayoutDashboard,
  LoaderCircle,
  Lock,
  Maximize,
  Monitor,
  MousePointer2,
  MoveRight,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  Search,
  Settings2,
  Shield,
  SlidersHorizontal,
  Square,
  Target,
  Trash2,
  Type,
  Undo2,
  Upload,
  Video,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  Project,
  Scene,
  Tool,
  TeamSide,
  ProgramState,
  OfficialMatch,
  Player,
} from "./types";
import { Board } from "./components/Board";
import { SceneCard } from "./components/SceneCard";
import { CloudProjects } from "./components/CloudProjects";
import { importOfficialMatch } from "./lib/match-import";
import { Modal } from "./components/Modal";
import { MatchHub } from "./components/MatchHub";
import { createProject, uid } from "./lib/defaults";
import { FORMATIONS, applyFormation } from "./lib/formations";
import { playersAtTime } from "./lib/animation";
import {
  saveProject,
  loadProject,
  listProjects,
  loadProjectById,
  deleteProject,
  saveAsset,
  getAssetUrl,
  validateMediaFile,
  matchesMediaAsset,
} from "./lib/storage";
import { parseProject } from "./lib/validation";
import { studioRequest } from "./lib/api";
import {
  publishProgram,
  readProgram,
  subscribeCommands,
  subscribeProgram,
} from "./lib/broadcast";

type Panel = "lineup" | "scene" | "layers";
type Dialog =
  | "match"
  | "media"
  | "projects"
  | "export"
  | "settings"
  | "help"
  | "unlock"
  | null;
const TOOLS: Array<{ id: Tool; label: string; key: string; icon: LucideIcon }> =
  [
    { id: "select", label: "Select & move", key: "V", icon: MousePointer2 },
    { id: "arrow", label: "Movement arrow", key: "A", icon: ArrowUpRight },
    { id: "pass", label: "Passing line", key: "P", icon: MoveRight },
    {
      id: "curve",
      label: "Curved run",
      key: "C",
      icon: ArrowUpRightFromSquare,
    },
    { id: "freehand", label: "Freehand drawing", key: "D", icon: Pencil },
    { id: "zone", label: "Tactical zone", key: "Z", icon: Square },
    { id: "ellipse", label: "Ellipse", key: "O", icon: Circle },
    { id: "highlight", label: "Spotlight", key: "H", icon: Target },
    { id: "text", label: "Text label", key: "T", icon: Type },
  ];
const COLORS = [
  "#c6f36b",
  "#ffffff",
  "#ef654d",
  "#81b6fa",
  "#c7a4f4",
  "#f5c866",
];
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";
const displayTime = (time: number) => `${time.toFixed(1)}s`;
function ToolButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={`icon-button ${active ? "active" : ""}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={17} />
    </button>
  );
}

export function App() {
  const [project, setProject] = useState<Project>(createProject);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("Opening studio");
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(3);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("lineup");
  const [side, setSide] = useState<TeamSide>("home");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState("");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string>();
  const [mediaRevision, setMediaRevision] = useState(0);
  const [clipDuration, setClipDuration] = useState(0);
  const [clipTime, setClipTime] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [program, setProgram] = useState<ProgramState | null>(readProgram);
  const [transition, setTransition] = useState<"cut" | "mix">("mix");
  const [localProjects, setLocalProjects] = useState<
    Array<{ id: string; name: string; updatedAt: string }>
  >([]);
  const [projectLibrary, setProjectLibrary] = useState<"local" | "cloud">(
    "local",
  );
  const [password, setPassword] = useState("");
  const [cloudStatus, setCloudStatus] = useState<{
    configured: boolean;
    authenticated: boolean;
    cloud: boolean;
  }>({ configured: false, authenticated: false, cloud: false });
  const [busy, setBusy] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [, renderHistory] = useState(0);
  const boardContainer = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const history = useRef<{ past: Scene[]; future: Scene[] }>({
    past: [],
    future: [],
  });
  const cancelRecording = useRef<AbortController | null>(null);
  const loadedRef = useRef(false);
  const latest = useRef(project);
  latest.current = project;
  const scene =
    project.scenes.find((item) => item.id === project.activeSceneId) ??
    project.scenes[0];
  const selectedPlayer = scene.players.find((item) => item.id === selectedId);
  const selectedAnnotation = scene.annotations.find(
    (item) => item.id === selectedId,
  );
  const team = project[side];
  const asset = project.assets.find((item) => item.id === scene.mediaId);
  const roster = scene.players.filter((item) => item.team === side);
  const onPitch = roster.filter((item) => item.onPitch);
  const bench = roster.filter((item) => !item.onPitch);
  const notify = (value: string) => setToast(value);
  useEffect(() => {
    let mounted = true;
    loadProject()
      .then((saved) => {
        if (mounted) {
          if (saved) setProject(saved);
          setLoaded(true);
          loadedRef.current = true;
        }
      })
      .catch((e) => {
        if (mounted) {
          notify(message(e));
          setLoaded(true);
          loadedRef.current = true;
        }
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    setSaveState("Saving changes");
    const timer = setTimeout(() => {
      saveProject(project)
        .then(() => setSaveState("Saved on this device"))
        .catch((e) => {
          setSaveState("Save failed");
          notify(message(e));
        });
    }, 450);
    return () => clearTimeout(timer);
  }, [project, loaded]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    let stale = false;
    let current: string | null = null;
    setMediaUrl(undefined);
    setClipDuration(0);
    setClipTime(0);
    if (scene.mediaId)
      getAssetUrl(scene.mediaId)
        .then((url) => {
          if (stale) {
            if (url) URL.revokeObjectURL(url);
            return;
          }
          current = url;
          setMediaUrl(url ?? undefined);
          if (!url)
            notify(
              "This media is not on this device. Reattach the original file from the media library.",
            );
        })
        .catch((e) => notify(message(e)));
    else setMediaUrl(undefined);
    return () => {
      stale = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [scene.mediaId, mediaRevision]);
  useEffect(() => {
    if (!playing) return;
    const started = performance.now();
    const initial = time;
    let raf = 0;
    const tick = (now: number) => {
      const next = initial + (now - started) / 1000;
      if (next >= scene.duration) {
        setTime(scene.duration);
        setPlaying(false);
        return;
      }
      setTime(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, scene.duration]);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (playing || recording)
      void el
        .play()
        .catch(() => notify("Press play on the clip to allow video playback."));
    else el.pause();
  }, [playing, recording, mediaUrl]);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const update = () => {
      setClipTime(el.currentTime);
      setClipDuration(Number.isFinite(el.duration) ? el.duration : 0);
    };
    el.addEventListener("timeupdate", update);
    el.addEventListener("loadedmetadata", update);
    return () => {
      el.removeEventListener("timeupdate", update);
      el.removeEventListener("loadedmetadata", update);
    };
  }, [mediaUrl, asset?.kind]);
  useEffect(() => subscribeProgram(setProgram), []);
  const commandRef = useRef<(command: string) => void>(() => {});
  commandRef.current = (command) => {
    if (command === "next" || command === "previous") {
      const index = project.scenes.findIndex(
        (item) => item.id === project.activeSceneId,
      );
      const next =
        project.scenes[
          (index + (command === "next" ? 1 : -1) + project.scenes.length) %
            project.scenes.length
        ];
      switchScene(next.id);
      takeLive(next);
    } else if (command === "play") {
      const current = readProgram();
      if (current) {
        const now = current.playing
          ? Math.min(
              current.scene.duration,
              current.time + (Date.now() - current.startedAt) / 1000,
            )
          : current.time;
        publishProgram({
          ...current,
          playing: !current.playing,
          time: now >= current.scene.duration ? 0 : now,
          startedAt: Date.now(),
          revision: Date.now(),
        });
      }
    } else if (command === "blackout") toggleBlackout();
  };
  useEffect(
    () => subscribeCommands((command) => commandRef.current(command)),
    [],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        dialog ||
        recording ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        ) ||
        (e.target as HTMLElement).isContentEditable
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void saveProject(latest.current)
          .then(() => notify("Project saved on this device."))
          .catch((e) => notify(message(e)));
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (e.key === "Escape") {
        setTool("select");
        setSelectedId(null);
        return;
      }
      const t = TOOLS.find(
        (item) => item.key.toLowerCase() === e.key.toLowerCase(),
      );
      if (t) setTool(t.id);
      if (e.key === "Enter") takeLive();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  useEffect(() => {
    if (dialog === "projects")
      void listProjects()
        .then(setLocalProjects)
        .catch((e) => notify(message(e)));
    if (dialog === "unlock")
      void studioRequest<typeof cloudStatus>("/api/session")
        .then(setCloudStatus)
        .catch((e) => setUnlockError(message(e)));
  }, [dialog]);
  function updateProject(updater: (p: Project) => Project) {
    setProject((current) => ({
      ...updater(current),
      updatedAt: new Date().toISOString(),
    }));
  }
  function remember() {
    history.current.past = [
      ...history.current.past.slice(-79),
      structuredClone(scene),
    ];
    history.current.future = [];
    renderHistory((v) => v + 1);
  }
  function changeScene(next: Scene, rememberChange = true) {
    if (rememberChange) remember();
    updateProject((p) => ({
      ...p,
      scenes: p.scenes.map((s) => (s.id === next.id ? next : s)),
    }));
  }
  function patchScene(patch: Partial<Scene>, rememberChange = true) {
    changeScene({ ...scene, ...patch }, rememberChange);
  }
  function undo() {
    const previous = history.current.past.pop();
    if (!previous) return;
    history.current.future.push(structuredClone(scene));
    changeScene(previous, false);
    setSelectedId(null);
    renderHistory((v) => v + 1);
  }
  function redo() {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(structuredClone(scene));
    changeScene(next, false);
    setSelectedId(null);
    renderHistory((v) => v + 1);
  }
  const switchScene = useCallback((id: string) => {
    setPlaying(false);
    setTime(0);
    setSelectedId(null);
    history.current = { past: [], future: [] };
    setProject((p) => ({
      ...p,
      activeSceneId: id,
      updatedAt: new Date().toISOString(),
    }));
  }, []);
  function addScene() {
    if (project.scenes.length >= 200)
      return notify("A project supports up to 200 scenes.");
    const next = structuredClone(scene);
    next.id = uid();
    next.name = `Scene ${project.scenes.length + 1}`;
    next.subtitle = "Tactical analysis";
    updateProject((p) => ({
      ...p,
      scenes: [...p.scenes, next],
      activeSceneId: next.id,
    }));
    setTime(0);
    setPlaying(false);
    setSelectedId(null);
    history.current = { past: [], future: [] };
  }
  function removeScene() {
    if (project.scenes.length === 1)
      return notify("Keep at least one scene in the project.");
    const remaining = project.scenes.filter((item) => item.id !== scene.id);
    updateProject((p) => ({
      ...p,
      scenes: remaining,
      activeSceneId: remaining[0].id,
    }));
    setSelectedId(null);
    setTime(0);
    setPlaying(false);
    history.current = { past: [], future: [] };
  }
  function boardChange(next: Scene) {
    const moved = next.players.some(
      (p, i) => p.x !== scene.players[i]?.x || p.y !== scene.players[i]?.y,
    );
    if (moved && scene.keyframes.length) {
      const t = Math.round(time * 10) / 10;
      const frame = {
        id: uid(),
        time: t,
        positions: Object.fromEntries(
          next.players.map((p) => [p.id, { x: p.x, y: p.y }]),
        ),
      };
      next = {
        ...next,
        keyframes: [
          ...next.keyframes.filter((f) => Math.abs(f.time - t) > 0.05),
          frame,
        ].sort((a, b) => a.time - b.time),
      };
    }
    changeScene(next, false);
  }
  function deleteSelected() {
    if (!selectedId) return;
    if (selectedAnnotation)
      patchScene({
        annotations: scene.annotations.filter((a) => a.id !== selectedId),
      });
    else if (selectedPlayer)
      patchScene({
        players: scene.players.map((p) =>
          p.id === selectedId ? { ...p, onPitch: false } : p,
        ),
      });
    setSelectedId(null);
  }
  function changePlayer(patch: Partial<Player>) {
    if (selectedPlayer)
      patchScene({
        players: scene.players.map((p) =>
          p.id === selectedId ? { ...p, ...patch } : p,
        ),
      });
  }
  function substitute(outId: string, inId: string) {
    const outgoing = scene.players.find((p) => p.id === outId);
    if (!outgoing) return;
    patchScene({
      players: scene.players.map((p) =>
        p.id === outId
          ? { ...p, onPitch: false }
          : p.id === inId
            ? { ...p, onPitch: true, x: outgoing.x, y: outgoing.y }
            : p,
      ),
    });
    setSelectedId(inId);
    notify("Substitution applied to this tactical scene.");
  }
  function formation(value: string) {
    patchScene({
      players: applyFormation(scene.players, value, side),
      keyframes: [],
    });
    updateProject((p) => ({ ...p, [side]: { ...p[side], formation: value } }));
    setTime(0);
  }
  function addKeyframe() {
    const t = Math.round(time * 10) / 10;
    const frame = {
      id: uid(),
      time: t,
      positions: Object.fromEntries(
        playersAtTime(scene, time).map((p) => [p.id, { x: p.x, y: p.y }]),
      ),
    };
    patchScene({
      keyframes: [
        ...scene.keyframes.filter((f) => Math.abs(f.time - t) > 0.05),
        frame,
      ].sort((a, b) => a.time - b.time),
    });
    notify(
      `Position keyframe saved at ${displayTime(t)}. Move players at another time to animate.`,
    );
  }
  function togglePlay() {
    if (time >= scene.duration) setTime(0);
    setPlaying((value) => !value);
  }
  function takeLive(target = scene) {
    try {
      const next: ProgramState = {
        projectId: project.id,
        scene: structuredClone(target),
        home: project.home,
        away: project.away,
        playing: false,
        startedAt: Date.now(),
        time: 0,
        blackout: false,
        transition,
        revision: Date.now(),
      };
      publishProgram(next);
      setProgram(next);
      notify(`On programme: ${target.name}`);
    } catch (e) {
      notify(message(e));
    }
  }
  function toggleBlackout() {
    const current = readProgram();
    if (current) {
      const next = {
        ...current,
        blackout: !current.blackout,
        revision: Date.now(),
      };
      publishProgram(next);
      setProgram(next);
    }
  }
  async function addMedia(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      Array.from(files).forEach(validateMediaFile);
      const saved = await Promise.all(
        Array.from(files).map((file) => {
          const existing = project.assets.find((item) =>
            matchesMediaAsset(file, item),
          );
          return saveAsset(file, existing?.id);
        }),
      );
      updateProject((p) => ({
        ...p,
        assets: [
          ...p.assets.filter(
            (item) => !saved.some((next) => next.id === item.id),
          ),
          ...saved,
        ],
        scenes: p.scenes.map((s) =>
          s.id === scene.id
            ? {
                ...s,
                mediaId: saved[0].id,
                background: "media",
                mediaTime: s.mediaId === saved[0].id ? s.mediaTime : 0,
              }
            : s,
        ),
      }));
      setMediaRevision((value) => value + 1);
      setDialog(null);
      setPlaying(false);
      setTime(0);
      notify(
        `${saved.length} media file${saved.length === 1 ? "" : "s"} saved on this device.`,
      );
    } catch (e) {
      notify(message(e));
    } finally {
      setBusy(false);
      if (mediaInput.current) mediaInput.current.value = "";
    }
  }
  async function importProject(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 25 * 1024 * 1024)
        throw new Error("Project files must be smaller than 25 MB.");
      const next = parseProject(await file.text());
      await saveProject(project);
      setProject(next);
      setDialog(null);
      setSelectedId(null);
      setTime(0);
      setPlaying(false);
      history.current = { past: [], future: [] };
      notify(
        "Project imported. Original media files may need reattaching on this device.",
      );
    } catch (e) {
      notify(message(e));
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  }
  async function openLocal(id: string) {
    try {
      await saveProject(project);
      const saved = await loadProjectById(id);
      if (saved) {
        setProject(saved);
        setDialog(null);
        setPlaying(false);
        setTime(0);
        setSelectedId(null);
        history.current = { past: [], future: [] };
      }
    } catch (e) {
      notify(message(e));
    }
  }
  async function newProject() {
    try {
      await saveProject(project);
      const next = createProject();
      setProject(next);
      setDialog(null);
      setPlaying(false);
      setTime(0);
      setSelectedId(null);
      history.current = { past: [], future: [] };
    } catch (e) {
      notify(message(e));
    }
  }
  function importMatch(match: OfficialMatch) {
    updateProject((p) => importOfficialMatch(p, scene, match));
    setTime(0);
    setPlaying(false);
    setSelectedId(null);
    history.current = { past: [], future: [] };
    setDialog(null);
    notify(
      "Official match saved separately. The board is an editable tactical copy.",
    );
  }
  async function unlock() {
    setBusy(true);
    setUnlockError("");
    try {
      await studioRequest("/api/session", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setCloudStatus(await studioRequest("/api/session"));
      setPassword("");
      notify("Cloud services unlocked for 12 hours.");
      setDialog("projects");
    } catch (e) {
      setUnlockError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function cloudSave() {
    setBusy(true);
    try {
      await saveProject(project);
      await studioRequest(
        `/api/projects?id=${encodeURIComponent(project.id)}`,
        { method: "PUT", body: JSON.stringify(project) },
      );
      notify(
        "Project snapshot saved to private cloud storage. Media stays on this device.",
      );
    } catch (e) {
      notify(message(e));
      setDialog("unlock");
    } finally {
      setBusy(false);
    }
  }
  async function restoreCloud(next: Project) {
    try {
      await saveProject(project);
      setProject(next);
      setDialog(null);
      setTime(0);
      setPlaying(false);
      setSelectedId(null);
      history.current = { past: [], future: [] };
      notify("Cloud snapshot restored. Reattach media if needed.");
    } catch (e) {
      notify(message(e));
    }
  }
  function cloudOpen() {
    setProjectLibrary("cloud");
  }
  async function exportFile(kind: "json" | "png" | "svg" | "webm") {
    if (kind !== "json" && scene.background === "media" && !mediaUrl)
      return notify(
        "Wait for the media to load or reattach the original file before exporting.",
      );
    const svg = boardContainer.current?.querySelector("svg");
    if (kind !== "json" && !svg) return;
    const exporters = await import("./lib/export");
    const media =
      scene.background === "media"
        ? (boardContainer.current?.querySelector("video,img") as
            | HTMLVideoElement
            | HTMLImageElement
            | undefined)
        : undefined;
    try {
      if (kind === "json") {
        exporters.downloadProject(project);
        notify("Project exported. Media files stay in your local library.");
      } else if (kind === "png") {
        await exporters.exportBoardPng(svg!, scene.name, media);
        notify("High-resolution still exported.");
      } else if (kind === "svg") {
        if (scene.background === "media")
          return notify(
            "Use PNG to include your still or video frame. SVG exports tactical graphics only.",
          );
        exporters.exportBoardSvg(svg!, scene.name);
      } else {
        setDialog(null);
        setPlaying(false);
        setRecording(true);
        setRecordProgress(0);
        cancelRecording.current = new AbortController();
        const previous = time;
        if (video.current) video.current.currentTime = scene.mediaTime;
        try {
          await exporters.recordBoardWebm(svg!, scene.name, {
            duration: scene.duration,
            onFrame: (t) => flushSync(() => setTime(t)),
            mediaElement: media,
            fps: 30,
            signal: cancelRecording.current.signal,
            onProgress: setRecordProgress,
          });
          notify("Silent WebM analysis clip exported.");
        } finally {
          setRecording(false);
          setTime(previous);
          video.current?.pause();
        }
      }
    } catch (e) {
      notify(message(e));
    }
  }

  if (!loaded)
    return (
      <div className="loading-screen">
        <span className="brand-symbol">
          B<span>O</span>
        </span>
        <LoaderCircle className="spin" />
        <p>Opening your studio…</p>
      </div>
    );
  return (
    <div className="studio-shell">
      <input
        ref={mediaInput}
        type="file"
        hidden
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,video/mp4,video/webm,video/ogg,video/quicktime"
        onChange={(e) => void addMedia(e.target.files)}
        aria-label="Upload analysis media"
      />
      <input
        ref={importInput}
        type="file"
        hidden
        accept=".json"
        onChange={(e) => void importProject(e.target.files?.[0])}
        aria-label="Import project file"
      />
      <header className="topbar">
        <a className="brand" href="/" aria-label="Bang On Tactics studio">
          <span className="brand-symbol">
            B<span>O</span>
          </span>
          <span>
            BANG ON <b>TACTICS</b>
            <small>THE ANALYSIS STUDIO</small>
          </span>
        </a>
        <span className="topbar-divider" />
        <button
          className="project-title"
          onClick={() => setDialog("settings")}
          title="Project settings"
        >
          <span>{project.name}</span>
          <ChevronDown size={13} />
        </button>
        <div className="save-status">
          <span
            className={`status-dot ${saveState === "Save failed" ? "error" : ""}`}
          />
          {saveState}
        </div>
        <div className="topbar-actions">
          <ToolButton
            icon={HelpCircle}
            label="Keyboard shortcuts"
            onClick={() => setDialog("help")}
          />
          <button className="button subtle" onClick={() => setDialog("export")}>
            <Download size={15} /> Export
          </button>
          <button
            className="button output-button"
            onClick={() =>
              window.open("/output", "bang-on-output", "width=1280,height=780")
            }
          >
            <Monitor size={16} /> Open output <ArrowUpRight size={13} />
          </button>
        </div>
      </header>
      <nav className="rail" aria-label="Studio navigation">
        <div className="rail-top">
          <button
            className="rail-item active"
            title="Tactical studio"
            aria-label="Tactical studio"
            onClick={() => setDialog(null)}
          >
            <LayoutDashboard size={21} />
            <span>Studio</span>
          </button>
          <button
            className="rail-item"
            title="Match hub"
            aria-label="Match hub"
            onClick={() => setDialog("match")}
          >
            <Shield size={21} />
            <span>Matches</span>
          </button>
          <button
            className="rail-item"
            title="Media library"
            aria-label="Media library"
            onClick={() => setDialog("media")}
          >
            <Film size={21} />
            <span>Media</span>
          </button>
          <button
            className="rail-item"
            title="Projects"
            aria-label="Projects"
            onClick={() => setDialog("projects")}
          >
            <FolderOpen size={21} />
            <span>Projects</span>
          </button>
        </div>
        <div className="rail-bottom">
          <button
            className="rail-item"
            title="Project settings"
            aria-label="Project settings"
            onClick={() => setDialog("settings")}
          >
            <Settings2 size={21} />
            <span>Settings</span>
          </button>
          <span className="rail-monogram">
            BOS<span>STUDIO</span>
          </span>
        </div>
      </nav>
      <main className="workspace">
        <div className="workspace-heading">
          <div>
            <div className="breadcrumb">
              ANALYSIS STUDIO <span>/</span>{" "}
              <span>
                {scene.background === "media"
                  ? "MEDIA TELESTRATION"
                  : "TACTICAL BOARD"}
              </span>
            </div>
            <h1>
              {scene.name}
              <span className="pill">
                {scene.sourceMatchId &&
                scene.sourceMatchId === project.officialMatch?.id
                  ? "Tactical copy"
                  : "Manual scenario"}
              </span>
            </h1>
          </div>
          <div className="heading-actions">
            <button
              className="button small subtle"
              onClick={() => {
                setPanel("scene");
              }}
            >
              <SlidersHorizontal size={14} /> Board settings
            </button>
            <ToolButton
              icon={Expand}
              label="Expand board"
              onClick={() => boardContainer.current?.requestFullscreen?.()}
            />
          </div>
        </div>
        <div className="canvas-shell">
          <div className="canvas-topline">
            <div className="canvas-tabs">
              <button
                className={scene.background === "pitch" ? "active" : ""}
                onClick={() => patchScene({ background: "pitch" })}
              >
                <Grid2X2 size={14} /> Tactical board
              </button>
              <button
                className={scene.background === "media" ? "active" : ""}
                onClick={() =>
                  scene.mediaId
                    ? patchScene({ background: "media" })
                    : setDialog("media")
                }
              >
                <Video size={14} /> Telestration
              </button>
            </div>
            <div className="canvas-meta">
              <span className="tiny-dot" /> OPERATOR PREVIEW{" "}
              <span className="separator">|</span>{" "}
              {scene.camera === "half" ? "HALF PITCH" : "FULL PITCH"}
            </div>
          </div>
          <div className="board-stage">
            <div
              className="vertical-tools"
              role="toolbar"
              aria-label="Drawing tools"
            >
              {TOOLS.map(({ id, label, key, icon: Icon }) => (
                <button
                  className={`drawing-tool ${tool === id ? "active" : ""}`}
                  key={id}
                  aria-label={label}
                  title={`${label} (${key})`}
                  onClick={() => setTool(id)}
                  disabled={recording}
                >
                  <Icon size={19} />
                </button>
              ))}
              <span className="toolbar-line" />
              <button
                className={`drawing-tool ${tool === "erase" ? "active" : ""}`}
                aria-label="Erase annotation"
                title="Erase annotation"
                onClick={() => setTool("erase")}
              >
                <Trash2 size={17} />
              </button>
            </div>
            <div className="board-surround">
              <div className="board-banner">
                <div>
                  <span
                    className="on-pitch-dot"
                    style={{ background: project.home.color }}
                  />
                  {project.home.shortName}
                  <span className="vs">vs</span>
                  <span
                    className="on-pitch-dot"
                    style={{ background: project.away.color }}
                  />
                  {project.away.shortName}
                </div>
                <span>{scene.subtitle}</span>
                <span className="board-direction">
                  ATTACKING DIRECTION <ArrowRight size={16} />
                </span>
              </div>
              <div
                className={`board-container ${scene.camera === "half" ? "half-board" : ""}`}
                ref={boardContainer}
              >
                <Board
                  scene={scene}
                  home={project.home}
                  away={project.away}
                  interactive={!playing && !recording}
                  tool={tool}
                  color={color}
                  strokeWidth={width}
                  selectedId={selectedId}
                  onSelect={(id) => {
                    setSelectedId(id);
                    if (scene.players.some((p) => p.id === id)) {
                      setPanel("lineup");
                      const player = scene.players.find((p) => p.id === id);
                      if (player) setSide(player.team);
                    }
                  }}
                  onGestureStart={remember}
                  onChange={boardChange}
                  time={time}
                  mediaUrl={mediaUrl}
                  videoRef={asset?.kind === "video" ? video : undefined}
                />
              </div>
              <div className="board-bottomline">
                <span>
                  <span className="lime-dot" />{" "}
                  {tool === "select"
                    ? "Drag players to shape the game"
                    : (TOOLS.find((t) => t.id === tool)?.label ??
                      "Click an annotation to erase")}
                </span>
                <span>
                  {scene.background === "media"
                    ? (asset?.name ?? "NO MEDIA")
                    : "105 × 68 M"}{" "}
                  <span className="separator">/</span>{" "}
                  {scene.background === "media"
                    ? "LOCAL MEDIA"
                    : "2D TACTICAL VIEW"}
                </span>
              </div>
            </div>
          </div>
          <div className="canvas-toolbar">
            <div className="color-controls">
              <span className="toolbar-caption">INK</span>
              {COLORS.map((value) => (
                <button
                  key={value}
                  className={`color-swatch ${color === value ? "active" : ""}`}
                  style={{ background: value }}
                  aria-label={`Ink ${value}`}
                  onClick={() => setColor(value)}
                />
              ))}
              <span className="toolbar-line vertical" />
              <select
                aria-label="Stroke width"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              >
                <option value={2}>Fine</option>
                <option value={3}>Medium</option>
                <option value={5}>Bold</option>
              </select>
            </div>
            <div className="edit-controls">
              <ToolButton
                icon={Undo2}
                label="Undo"
                disabled={!history.current.past.length}
                onClick={undo}
              />
              <ToolButton
                icon={Redo2}
                label="Redo"
                disabled={!history.current.future.length}
                onClick={redo}
              />
              <span className="toolbar-line vertical" />
              <ToolButton
                icon={Eye}
                label="Toggle player names"
                active={scene.showNames}
                onClick={() => patchScene({ showNames: !scene.showNames })}
              />
              <ToolButton
                icon={Grid2X2}
                label="Toggle pitch grid"
                active={scene.showGrid}
                onClick={() => patchScene({ showGrid: !scene.showGrid })}
              />
              <ToolButton
                icon={Trash2}
                label="Delete selected"
                disabled={!selectedId}
                onClick={deleteSelected}
              />
            </div>
          </div>
        </div>
        {scene.background === "media" && asset?.kind === "video" ? (
          <div className="clip-controls">
            <Video size={16} />
            <span>{asset.name}</span>
            <button
              className="button small subtle"
              onClick={() => {
                if (!video.current) return;
                if (video.current.paused) void video.current.play();
                else video.current.pause();
              }}
            >
              Play / pause clip
            </button>
            <input
              type="range"
              aria-label="Video position"
              min="0"
              max={clipDuration || 1}
              step="0.04"
              value={clipTime}
              onChange={(e) => {
                if (video.current)
                  video.current.currentTime = Number(e.target.value);
                setClipTime(Number(e.target.value));
              }}
            />
            <span>{clipTime.toFixed(2)}s</span>
            <button
              className="button small"
              onClick={() => {
                video.current?.pause();
                patchScene({ mediaTime: video.current?.currentTime ?? 0 });
                notify("Frame frozen and saved to this scene.");
              }}
            >
              Freeze frame
            </button>
          </div>
        ) : null}
        <section className="timeline">
          <div className="timeline-heading">
            <div className="timeline-label">
              <Clapperboard size={16} />
              <h2>Scene rundown</h2>
              <span className="count">
                {String(project.scenes.length).padStart(2, "0")}
              </span>
            </div>
            <div className="timeline-actions">
              <button className="text-button" onClick={addKeyframe}>
                <Plus size={13} /> Position keyframe
              </button>
              <span className="separator">|</span>
              <button className="text-button" onClick={addScene}>
                <Plus size={14} /> Add scene
              </button>
            </div>
          </div>
          <div className="scene-strip">
            {project.scenes.map((item, index) => (
              <SceneCard
                key={item.id}
                scene={item}
                home={project.home}
                away={project.away}
                index={index}
                active={item.id === scene.id}
                onAir={program?.scene.id === item.id}
                onSelect={switchScene}
              />
            ))}
            <button
              className="add-scene-card"
              onClick={addScene}
              aria-label="Add scene"
            >
              <Plus size={22} />
              <span>New scene</span>
            </button>
          </div>
          <div className="transport">
            <ToolButton
              icon={ChevronsLeft}
              label="Rewind to start"
              onClick={() => {
                setPlaying(false);
                setTime(0);
              }}
            />
            <button
              className="play-button"
              aria-label={playing ? "Pause animation" : "Play animation"}
              onClick={togglePlay}
              disabled={recording}
            >
              {playing ? (
                <Pause size={17} />
              ) : (
                <Play size={17} fill="currentColor" />
              )}
            </button>
            <span className="timecode">
              {displayTime(time)} <span>/ {displayTime(scene.duration)}</span>
            </span>
            <div className="scrubber">
              <input
                type="range"
                aria-label="Animation timeline"
                min="0"
                max={scene.duration}
                step="0.1"
                value={time}
                onChange={(e) => {
                  setPlaying(false);
                  setTime(Number(e.target.value));
                }}
              />
              {scene.keyframes.map((frame) => (
                <button
                  key={frame.id}
                  title={`Keyframe at ${frame.time}s — right-click to remove`}
                  aria-label={`Keyframe at ${frame.time}s`}
                  className="keyframe-dot"
                  style={{ left: `${(frame.time / scene.duration) * 100}%` }}
                  onClick={() => {
                    setPlaying(false);
                    setTime(frame.time);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    patchScene({
                      keyframes: scene.keyframes.filter(
                        (item) => item.id !== frame.id,
                      ),
                    });
                  }}
                />
              ))}
            </div>
            <span className="frame-count">
              {scene.keyframes.length} KEYFRAMES
            </span>
            <ToolButton
              icon={Plus}
              label="Add position keyframe"
              onClick={addKeyframe}
            />
          </div>
        </section>
        <footer className="workspace-footer">
          <span>
            <kbd>V</kbd> Select <kbd>A</kbd> Arrow <kbd>Space</kbd> Play{" "}
            <kbd>⌘ Z</kbd> Undo
          </span>
          <span>
            BANG ON SPORTS <span className="lime-dot" /> MADE FOR THE MOMENT
          </span>
        </footer>
      </main>
      <aside className="inspector">
        <div className="inspector-tabs">
          {(["lineup", "scene", "layers"] as const).map((item) => (
            <button
              key={item}
              className={panel === item ? "active" : ""}
              onClick={() => setPanel(item)}
            >
              {item === "lineup"
                ? "Teams & players"
                : item === "scene"
                  ? "Scene"
                  : "Layers"}
            </button>
          ))}
        </div>
        <div className="inspector-body">
          {panel === "lineup" ? (
            <>
              <div className="inspector-section-header">
                <span className="section-label">MATCH SETUP</span>
                <button
                  className="text-button"
                  onClick={() => setDialog("match")}
                >
                  <Search size={13} /> Find match
                </button>
              </div>
              <div className="match-card">
                <div className="match-card-top">
                  <span className="tiny-dot" />
                  {project.officialMatch
                    ? project.officialMatch.competition
                    : "CUSTOM TACTICAL SCENARIO"}
                </div>
                <div className="match-teams">
                  {(["home", "away"] as const).map((s) => (
                    <div key={s}>
                      <div
                        className="team-shield"
                        style={{
                          color: project[s].color,
                          borderColor: `${project[s].color}55`,
                        }}
                      >
                        {project.badgesCleared && project[s].badge ? (
                          <img
                            alt={`${project[s].name} badge`}
                            src={project[s].badge}
                          />
                        ) : (
                          <Shield size={26} />
                        )}
                      </div>
                      <strong>{project[s].shortName}</strong>
                      <small>{project[s].formation}</small>
                    </div>
                  ))}
                  <span className="match-vs">
                    {project.officialMatch
                      ? `${project.officialMatch.score.home ?? "–"} : ${project.officialMatch.score.away ?? "–"}`
                      : "VS"}
                  </span>
                </div>
                <div className="match-source">
                  {project.officialMatch ? (
                    <>
                      <span className="amber-dot" />{" "}
                      {!(
                        project.officialMatch.lineups.length === 2 &&
                        project.officialMatch.lineups.every(
                          (l) => l.status === "confirmed",
                        )
                      )
                        ? "Provider-reported · review team sheet"
                        : "Confirmed provider lineup"}
                    </>
                  ) : (
                    <>
                      <Pencil size={11} /> Manual lineup · editable scenario
                    </>
                  )}
                </div>
              </div>
              <div className="team-switch">
                <button
                  className={side === "home" ? "active" : ""}
                  onClick={() => {
                    setSide("home");
                    setSelectedId(null);
                  }}
                >
                  <span style={{ background: project.home.color }} />
                  {project.home.shortName}
                </button>
                <button
                  className={side === "away" ? "active" : ""}
                  onClick={() => {
                    setSide("away");
                    setSelectedId(null);
                  }}
                >
                  <span style={{ background: project.away.color }} />
                  {project.away.shortName}
                </button>
              </div>
              <div className="formation-row">
                <span>FORMATION</span>
                <select
                  aria-label="Team formation"
                  value={
                    FORMATIONS.includes(
                      team.formation as (typeof FORMATIONS)[number],
                    )
                      ? team.formation
                      : "4-3-3"
                  }
                  onChange={(e) => formation(e.target.value)}
                >
                  {FORMATIONS.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className="lineup-heading">
                <span>STARTING XI</span>
                <span>{onPitch.length} / 11</span>
              </div>
              <div className="player-list">
                {onPitch.map((p) => (
                  <button
                    className={`player-row ${selectedId === p.id ? "selected" : ""}`}
                    key={p.id}
                    onClick={() => {
                      setSelectedId(p.id);
                      setTool("select");
                    }}
                  >
                    <span
                      className="shirt-number"
                      style={{
                        color: p.role === "GK" ? "#f5c866" : team.color,
                      }}
                    >
                      {p.number || "–"}
                    </span>
                    <span className="player-name">{p.name}</span>
                    <span className="player-role">{p.role}</span>
                    <Ellipsis size={14} />
                  </button>
                ))}
              </div>
              <div className="lineup-heading bench-heading">
                <span>SUBSTITUTES</span>
                <span>{bench.length}</span>
              </div>
              <div className="player-list bench-list">
                {bench.map((p) => (
                  <button
                    className={`player-row ${selectedId === p.id ? "selected" : ""}`}
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <span className="shirt-number muted">
                      {p.number || "–"}
                    </span>
                    <span className="player-name">{p.name}</span>
                    <span className="player-role">{p.role}</span>
                    <Plus size={13} />
                  </button>
                ))}
              </div>
              <button
                className="text-button add-player"
                onClick={() => {
                  if (scene.players.length >= 80)
                    return notify("A scene supports up to 80 players.");
                  const p: Player = {
                    id: uid(),
                    team: side,
                    number: roster.length + 1,
                    name: "New player",
                    role: "MID",
                    onPitch: false,
                    x: 50,
                    y: 50,
                  };
                  patchScene({ players: [...scene.players, p] });
                  setSelectedId(p.id);
                }}
              >
                <Plus size={13} /> Add substitute
              </button>
              {selectedPlayer ? (
                <div className="player-editor">
                  <div className="inspector-section-header">
                    <span className="section-label">PLAYER DETAILS</span>
                    <button
                      className="icon-button tiny"
                      aria-label="Deselect player"
                      onClick={() => setSelectedId(null)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <label>
                    Name
                    <input
                      aria-label="Player name"
                      value={selectedPlayer.name}
                      maxLength={80}
                      onChange={(e) => changePlayer({ name: e.target.value })}
                    />
                  </label>
                  <div className="field-row">
                    <label>
                      Number
                      <input
                        aria-label="Player number"
                        type="number"
                        min="0"
                        max="999"
                        value={selectedPlayer.number}
                        onChange={(e) =>
                          changePlayer({
                            number: Math.round(
                              Math.min(
                                999,
                                Math.max(0, Number(e.target.value)),
                              ),
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Position
                      <select
                        aria-label="Player position"
                        value={selectedPlayer.role}
                        onChange={(e) => changePlayer({ role: e.target.value })}
                      >
                        {["GK", "DEF", "MID", "FWD"].map((role) => (
                          <option key={role}>{role}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {selectedPlayer.onPitch ? (
                    <button
                      className="button full small"
                      onClick={() =>
                        changePlayer({
                          highlighted: !selectedPlayer.highlighted,
                        })
                      }
                    >
                      <Target size={14} />{" "}
                      {selectedPlayer.highlighted
                        ? "Remove spotlight"
                        : "Spotlight player"}
                    </button>
                  ) : (
                    <label>
                      Replace starting player
                      <select
                        aria-label="Substitute for player"
                        value=""
                        onChange={(e) => {
                          if (e.target.value)
                            substitute(e.target.value, selectedPlayer.id);
                        }}
                      >
                        <option value="">Choose a player…</option>
                        {onPitch.map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.number} · {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {!selectedPlayer.onPitch && onPitch.length < 11 ? (
                    <button
                      className="button full small"
                      onClick={() => changePlayer({ onPitch: true })}
                    >
                      <Plus size={13} /> Add to pitch
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
          {panel === "scene" ? (
            <div className="settings-form">
              <span className="section-label">SCENE DETAILS</span>
              <label>
                Scene name
                <input
                  aria-label="Scene name"
                  value={scene.name}
                  maxLength={100}
                  onChange={(e) => patchScene({ name: e.target.value })}
                />
              </label>
              <label>
                Analysis subtitle
                <input
                  value={scene.subtitle}
                  maxLength={150}
                  onChange={(e) => patchScene({ subtitle: e.target.value })}
                />
              </label>
              <label>
                Duration (seconds)
                <input
                  aria-label="Scene duration"
                  type="number"
                  value={scene.duration}
                  min="1"
                  max="120"
                  onChange={(e) => {
                    const duration = Math.min(
                      120,
                      Math.max(1, Number(e.target.value)),
                    );
                    patchScene({
                      duration,
                      keyframes: scene.keyframes.filter(
                        (f) => f.time <= duration,
                      ),
                    });
                    setTime((t) => Math.min(t, duration));
                  }}
                />
              </label>
              <div className="section-rule" />
              <span className="section-label">PITCH APPEARANCE</span>
              <label>
                Surface
                <select
                  aria-label="Pitch surface"
                  value={scene.pitchTheme}
                  onChange={(e) =>
                    patchScene({
                      pitchTheme: e.target.value as Scene["pitchTheme"],
                    })
                  }
                >
                  <option value="stadium">Stadium green</option>
                  <option value="midnight">Midnight teal</option>
                </select>
              </label>
              <label>
                Camera
                <select
                  aria-label="Pitch camera"
                  value={scene.camera}
                  onChange={(e) =>
                    patchScene({ camera: e.target.value as Scene["camera"] })
                  }
                >
                  <option value="full">Full pitch</option>
                  <option value="half">Half pitch</option>
                </select>
              </label>
              {[
                ["showNames", "Player names"],
                ["showNumbers", "Shirt numbers"],
                ["showGrid", "Positional grid"],
              ].map(([key, label]) => (
                <label className="toggle-row" key={key}>
                  {label}
                  <input
                    type="checkbox"
                    checked={Boolean(scene[key as keyof Scene])}
                    onChange={(e) => patchScene({ [key]: e.target.checked })}
                  />
                </label>
              ))}
              <div className="section-rule" />
              <label>
                Presenter notes
                <textarea
                  aria-label="Presenter notes"
                  rows={4}
                  value={scene.notes}
                  maxLength={4000}
                  placeholder="Your talking points for this scene…"
                  onChange={(e) => patchScene({ notes: e.target.value })}
                />
              </label>
              <p className="hint">
                Notes appear in presenter view, outside the clean programme
                picture.
              </p>
              <button className="button full" onClick={addScene}>
                <Copy size={14} /> Duplicate scene
              </button>
              <button
                className="text-button danger"
                disabled={project.scenes.length === 1}
                onClick={removeScene}
              >
                <Trash2 size={13} /> Delete scene
              </button>
            </div>
          ) : null}
          {panel === "layers" ? (
            <>
              <div className="inspector-section-header">
                <span className="section-label">TACTICAL GRAPHICS</span>
                <span className="count">{scene.annotations.length}</span>
              </div>
              <p className="hint">
                Select a graphic to move it on the board or edit its properties.
              </p>
              {scene.annotations.length ? (
                scene.annotations.map((a, index) => (
                  <button
                    key={a.id}
                    className={`layer-row ${selectedId === a.id ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedId(a.id);
                      setTool("select");
                    }}
                  >
                    <span
                      className="layer-color"
                      style={{ background: a.color }}
                    />
                    <span>
                      {a.type === "text"
                        ? a.text
                        : a.type.charAt(0).toUpperCase() + a.type.slice(1)}{" "}
                      <small>{String(index + 1).padStart(2, "0")}</small>
                    </span>
                    <Layers size={14} />
                  </button>
                ))
              ) : (
                <div className="empty-state compact">
                  <Layers size={28} />
                  <p>Draw on the board to add your first graphic.</p>
                </div>
              )}
              {selectedAnnotation ? (
                <div className="settings-form layer-editor">
                  <span className="section-label">GRAPHIC PROPERTIES</span>
                  {selectedAnnotation.type === "text" ? (
                    <label>
                      Text
                      <input
                        aria-label="Annotation text"
                        value={selectedAnnotation.text ?? ""}
                        maxLength={100}
                        onChange={(e) =>
                          patchScene({
                            annotations: scene.annotations.map((a) =>
                              a.id === selectedId
                                ? { ...a, text: e.target.value }
                                : a,
                            ),
                          })
                        }
                      />
                    </label>
                  ) : null}
                  <label>
                    Colour
                    <input
                      aria-label="Annotation colour"
                      type="color"
                      value={selectedAnnotation.color}
                      onChange={(e) =>
                        patchScene({
                          annotations: scene.annotations.map((a) =>
                            a.id === selectedId
                              ? { ...a, color: e.target.value }
                              : a,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    className="button full small"
                    onClick={() => {
                      const copy = {
                        ...selectedAnnotation,
                        id: uid(),
                        points: selectedAnnotation.points.map((p) => ({
                          x: Math.min(99, p.x + 3),
                          y: Math.min(99, p.y + 3),
                        })),
                      };
                      patchScene({ annotations: [...scene.annotations, copy] });
                      setSelectedId(copy.id);
                    }}
                  >
                    <Copy size={14} /> Duplicate graphic
                  </button>
                  <button
                    className="button full small danger"
                    onClick={deleteSelected}
                  >
                    <Trash2 size={14} /> Delete graphic
                  </button>
                </div>
              ) : null}
              <div className="section-rule" />
              <button
                className="text-button danger"
                disabled={!scene.annotations.length}
                onClick={() => {
                  patchScene({ annotations: [] });
                  setSelectedId(null);
                }}
              >
                Clear all graphics
              </button>
            </>
          ) : null}
        </div>
        <div className="broadcast-panel">
          <div className="broadcast-label">
            <span
              className={`live-dot ${program && !program.blackout ? "on" : ""}`}
            />
            <strong>PROGRAMME</strong>
            <span>
              {program?.blackout ? "BLACK" : program ? "ON AIR" : "STANDBY"}
            </span>
          </div>
          <div className="programme-name">
            {program?.scene.name ?? "No scene on air"}
            <button
              className="icon-button tiny"
              title="Blackout programme"
              aria-label="Blackout programme"
              onClick={toggleBlackout}
              disabled={!program}
            >
              <Eye size={14} />
            </button>
          </div>
          <div className="broadcast-controls">
            <select
              aria-label="Scene transition"
              value={transition}
              onChange={(e) => setTransition(e.target.value as "mix" | "cut")}
            >
              <option value="mix">Dissolve · 350ms</option>
              <option value="cut">Cut</option>
            </select>
            <button
              className="take-button"
              onClick={() => takeLive()}
              disabled={recording}
            >
              Take live <ArrowRight size={16} />
            </button>
          </div>
          <button
            className="text-button presenter-link"
            onClick={() =>
              window.open(
                "/presenter",
                "bang-on-presenter",
                "width=1280,height=900",
              )
            }
          >
            <Monitor size={12} /> Open presenter view <ArrowUpRight size={12} />
          </button>
        </div>
      </aside>
      {toast ? (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
      {recording ? (
        <div className="recording-overlay">
          <LoaderCircle className="spin" size={28} />
          <h2>Recording your analysis</h2>
          <p>{Math.round(recordProgress * 100)}% · Keep this window open</p>
          <progress max="1" value={recordProgress} />
          <button
            className="button"
            onClick={() => cancelRecording.current?.abort()}
          >
            Cancel export
          </button>
        </div>
      ) : null}
      {dialog === "match" ? (
        <Modal
          title="The match starts here."
          eyebrow="FOOTBALL DATA"
          wide
          onClose={() => setDialog(null)}
        >
          <MatchHub
            onImport={importMatch}
            onUnlock={() => setDialog("unlock")}
          />
        </Modal>
      ) : null}
      {dialog === "media" ? (
        <Modal
          title="Every frame tells a story."
          eyebrow="MEDIA LIBRARY"
          wide
          onClose={() => setDialog(null)}
        >
          <div
            className="upload-zone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void addMedia(e.dataTransfer.files);
            }}
          >
            <ImagePlus size={32} />
            <h3>Bring the moment into focus.</h3>
            <p>
              Drop match footage or stills here. Media is stored privately on
              this device.
            </p>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => mediaInput.current?.click()}
            >
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Upload size={16} />
              )}{" "}
              Upload media
            </button>
            <small>
              PNG, JPEG, WebP · MP4, WebM, MOV · Up to 2 GB per file
            </small>
          </div>
          {project.assets.length ? (
            <div className="media-list">
              {project.assets.map((item) => (
                <button
                  key={item.id}
                  className={`media-row ${scene.mediaId === item.id ? "selected" : ""}`}
                  onClick={() => {
                    patchScene({
                      mediaId: item.id,
                      background: "media",
                      mediaTime: 0,
                    });
                    setDialog(null);
                    setPlaying(false);
                  }}
                >
                  {item.kind === "video" ? (
                    <Film size={22} />
                  ) : (
                    <ImagePlus size={22} />
                  )}
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.kind.toUpperCase()} ·{" "}
                      {(item.size / 1024 / 1024).toFixed(1)} MB · On this device
                    </small>
                  </span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
          ) : null}
        </Modal>
      ) : null}
      {dialog === "projects" ? (
        <Modal
          title="Your analysis, ready to go."
          eyebrow="PROJECT LIBRARY"
          wide
          onClose={() => setDialog(null)}
        >
          <div className="project-actions">
            <button
              className="button primary"
              onClick={() => void newProject()}
            >
              <Plus size={16} /> New project
            </button>
            <button
              className="button"
              onClick={() => importInput.current?.click()}
            >
              <Upload size={15} /> Import project
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => void cloudSave()}
            >
              <Cloud size={15} /> Save to cloud
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => void cloudOpen()}
            >
              <ArrowDownToLine size={15} /> Browse cloud
            </button>
          </div>
          <div className="notice">
            <FolderOpen size={18} />
            <p>
              Projects autosave on this device. Export a backup or save a
              private cloud snapshot. Original media files stay local.
            </p>
          </div>
          <div className="team-switch">
            <button
              className={projectLibrary === "local" ? "active" : ""}
              onClick={() => setProjectLibrary("local")}
            >
              On this device
            </button>
            <button
              className={projectLibrary === "cloud" ? "active" : ""}
              onClick={() => setProjectLibrary("cloud")}
            >
              Private cloud
            </button>
          </div>
          {projectLibrary === "cloud" ? (
            <CloudProjects
              onRestore={(next) => void restoreCloud(next)}
              onUnlock={() => setDialog("unlock")}
            />
          ) : (
            <div className="project-list">
              {localProjects.map((item) => (
                <div className="project-row" key={item.id}>
                  <span className="project-icon">
                    <Clapperboard size={23} />
                  </span>
                  <button onClick={() => void openLocal(item.id)}>
                    <strong>{item.name}</strong>
                    <small>
                      {new Date(item.updatedAt).toLocaleString()}{" "}
                      {item.id === project.id ? "· CURRENT PROJECT" : ""}
                    </small>
                  </button>
                  {item.id !== project.id ? (
                    <ToolButton
                      icon={Trash2}
                      label={`Delete project ${item.name}`}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete the saved project “${item.name}” from this device?`,
                          )
                        )
                          void deleteProject(item.id)
                            .then(() => listProjects())
                            .then(setLocalProjects)
                            .catch((e) => notify(message(e)));
                      }}
                    />
                  ) : (
                    <span className="pill green">OPEN</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Modal>
      ) : null}
      {dialog === "export" ? (
        <Modal
          title="Take the analysis further."
          eyebrow="EXPORT STUDIO"
          onClose={() => setDialog(null)}
        >
          <div className="export-options">
            <button onClick={() => void exportFile("png")}>
              <ImagePlus />
              <span>
                <strong>High-resolution still</strong>
                <small>PNG · 2× resolution · Current frame and graphics</small>
              </span>
              <Download size={17} />
            </button>
            <button onClick={() => void exportFile("webm")}>
              <Video />
              <span>
                <strong>Animated analysis clip</strong>
                <small>
                  Silent WebM · {scene.duration} seconds · Real-time recording
                </small>
              </span>
              <Download size={17} />
            </button>
            <button onClick={() => void exportFile("svg")}>
              <Pencil />
              <span>
                <strong>Vector tactical board</strong>
                <small>SVG · Editable graphics · Pitch scenes</small>
              </span>
              <Download size={17} />
            </button>
            <button onClick={() => void exportFile("json")}>
              <FolderOpen />
              <span>
                <strong>Complete project</strong>
                <small>
                  JSON · Scenes, lineups and annotations · Media separate
                </small>
              </span>
              <Download size={17} />
            </button>
          </div>
          <p className="hint">
            Programme output is clean and separate from these controls. Use a
            browser source or window capture in your broadcast software.
          </p>
        </Modal>
      ) : null}
      {dialog === "settings" ? (
        <Modal
          title="Make the studio yours."
          eyebrow="PROJECT SETTINGS"
          onClose={() => setDialog(null)}
        >
          <div className="settings-form">
            <label>
              Project name
              <input
                aria-label="Project name"
                value={project.name}
                maxLength={120}
                onChange={(e) =>
                  updateProject((p) => ({ ...p, name: e.target.value }))
                }
              />
            </label>
            {(["home", "away"] as const).map((s) => (
              <div className="team-settings" key={s}>
                <h3>{s === "home" ? "Home team" : "Away team"}</h3>
                <label>
                  Club / team name
                  <input
                    aria-label={`${s} team name`}
                    value={project[s].name}
                    maxLength={80}
                    onChange={(e) =>
                      updateProject((p) => ({
                        ...p,
                        [s]: { ...p[s], name: e.target.value },
                      }))
                    }
                  />
                </label>
                <div className="field-row">
                  <label>
                    Short name
                    <input
                      aria-label={`${s} short name`}
                      value={project[s].shortName}
                      maxLength={8}
                      onChange={(e) =>
                        updateProject((p) => ({
                          ...p,
                          [s]: {
                            ...p[s],
                            shortName: e.target.value.toUpperCase(),
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Team colour
                    <input
                      type="color"
                      aria-label={`${s} team colour`}
                      value={project[s].color}
                      onChange={(e) =>
                        updateProject((p) => ({
                          ...p,
                          [s]: { ...p[s], color: e.target.value },
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
            ))}
            <label className="toggle-row">
              Display rights-cleared team badges
              <input
                type="checkbox"
                checked={project.badgesCleared}
                onChange={(e) =>
                  updateProject((p) => ({
                    ...p,
                    badgesCleared: e.target.checked,
                  }))
                }
              />
            </label>
            <p className="hint">
              Badges appear only when the server’s licensed asset setting is
              also enabled. Official team sheets remain separate from tactical
              edits.
            </p>
            <button className="button" onClick={() => setDialog("unlock")}>
              <Lock size={14} /> Manage cloud access
            </button>
          </div>
        </Modal>
      ) : null}
      {dialog === "help" ? (
        <Modal
          title="Stay in the flow."
          eyebrow="STUDIO SHORTCUTS"
          onClose={() => setDialog(null)}
        >
          <div className="shortcut-list">
            {TOOLS.map((t) => (
              <div key={t.id}>
                <span>{t.label}</span>
                <kbd>{t.key}</kbd>
              </div>
            ))}
            {[
              ["Play / pause animation", "Space"],
              ["Take current scene live", "Enter"],
              ["Undo / redo", "⌘ Z / ⇧ ⌘ Z"],
              ["Delete selected object", "Delete"],
              ["Exit tool / deselect", "Esc"],
            ].map(([label, key]) => (
              <div key={label}>
                <span>{label}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
          <div className="notice">
            <Monitor size={18} />
            <p>
              Keep output and presenter views in the same browser on this
              computer. Presenter: ← / → scenes, Space play, B blackout, F
              fullscreen.
            </p>
          </div>
          <p className="hint">
            Animation: save a position keyframe, move the timeline, then move
            players. Right-click a keyframe marker to remove it.
          </p>
        </Modal>
      ) : null}
      {dialog === "unlock" ? (
        <Modal
          title="Unlock cloud services."
          eyebrow="PRIVATE STUDIO ACCESS"
          onClose={() => setDialog(null)}
        >
          <div className="notice">
            <Lock size={19} />
            <p>
              Cloud snapshots and football data use a secure server session.
              Your tactical board and local media work without signing in.
            </p>
          </div>
          {cloudStatus.authenticated ? (
            <div className="settings-form">
              <span className="pill green">STUDIO UNLOCKED</span>
              <p>
                Private storage{" "}
                {cloudStatus.cloud ? "connected" : "not connected"}.
              </p>
              <button
                className="button"
                onClick={() =>
                  void studioRequest("/api/session", { method: "DELETE" }).then(
                    () => {
                      setCloudStatus((s) => ({ ...s, authenticated: false }));
                      notify("Cloud session locked.");
                    },
                  )
                }
              >
                Lock cloud session
              </button>
            </div>
          ) : (
            <form
              className="settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                void unlock();
              }}
            >
              <label>
                Studio password
                <input
                  aria-label="Studio password"
                  autoComplete="current-password"
                  type="password"
                  value={password}
                  required
                  maxLength={256}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button className="button primary" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Lock size={15} />
                )}
                Unlock studio
              </button>
            </form>
          )}
          {unlockError ? (
            <p className="form-error" role="alert">
              {unlockError}
            </p>
          ) : null}
          <p className="hint">
            Deployment setup: configure STUDIO_PASSWORD and your licensed
            FOOTBALL_API_KEY in this project’s Vercel environment settings.
            Credentials are kept on the server.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
