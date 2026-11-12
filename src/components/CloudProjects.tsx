import { useEffect, useState } from "react";
import { ArrowRight, Cloud, LoaderCircle, Lock } from "lucide-react";
import type { Project } from "../types";
import { studioRequest } from "../lib/api";
import { validateProject } from "../lib/validation";
export function CloudProjects({
  onRestore,
  onUnlock,
}: {
  onRestore: (project: Project) => void;
  onUnlock: () => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let stale = false;
    async function load() {
      try {
        const index = await studioRequest<{
          projects: Array<{ id: string; updatedAt: string }>;
        }>("/api/projects");
        const recent = index.projects
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 20);
        const results = await Promise.allSettled(
          recent.map(async (item) =>
            validateProject(
              await studioRequest(
                `/api/projects?id=${encodeURIComponent(item.id)}`,
              ),
            ),
          ),
        );
        if (stale) return;
        setProjects(
          results.flatMap((item) =>
            item.status === "fulfilled" ? [item.value] : [],
          ),
        );
        if (results.some((item) => item.status === "rejected"))
          setError(
            "Some cloud snapshots could not be loaded. Try again shortly.",
          );
      } catch (e) {
        if (!stale)
          setError(
            e instanceof Error ? e.message : "Cloud projects are unavailable.",
          );
      } finally {
        if (!stale) setBusy(false);
      }
    }
    void load();
    return () => {
      stale = true;
    };
  }, []);
  if (busy)
    return (
      <div className="empty-state compact">
        <LoaderCircle className="spin" />
        <p>Opening your private cloud library…</p>
      </div>
    );
  return (
    <div>
      {error ? (
        <div className="notice error">
          <Lock size={17} />
          <p>{error}</p>
          <button className="text-button" onClick={onUnlock}>
            Cloud access
          </button>
        </div>
      ) : null}
      {projects.map((project) => (
        <button
          className="media-row"
          key={project.id}
          onClick={() => onRestore(project)}
        >
          <Cloud size={22} />
          <span>
            <strong>{project.name}</strong>
            <small>
              {new Date(project.updatedAt).toLocaleString()} ·{" "}
              {project.scenes.length} scenes
            </small>
          </span>
          <ArrowRight size={16} />
        </button>
      ))}
      {!projects.length && !error ? (
        <div className="empty-state compact">
          <Cloud size={30} />
          <h3>Your cloud library is ready.</h3>
          <p>Save a project snapshot to keep a private backup here.</p>
        </div>
      ) : null}
      <p className="hint">
        Showing your 20 most recent snapshots. Source footage stays on the
        device where it was uploaded.
      </p>
    </div>
  );
}
