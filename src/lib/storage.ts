import type { MediaAsset, Project } from "../types";
import { validateProject } from "./validation";

const DATABASE = "bang-on-tactics";
const LAST_PROJECT = "bang-on-tactics:last-project";
const PROJECT_STORE = "projects";
const ASSET_STORE = "assets";
let pendingDatabase: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (!("indexedDB" in globalThis))
    return Promise.reject(
      new Error(
        "This browser does not support local project storage. Export your project before closing the studio.",
      ),
    );
  if (!pendingDatabase)
    pendingDatabase = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROJECT_STORE))
          db.createObjectStore(PROJECT_STORE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(ASSET_STORE))
          db.createObjectStore(ASSET_STORE, { keyPath: "id" });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          pendingDatabase = undefined;
        };
        resolve(db);
      };
      request.onerror = () => {
        pendingDatabase = undefined;
        reject(
          new Error(
            `Local storage is unavailable: ${request.error?.message ?? "database open failed"}`,
          ),
        );
      };
      request.onblocked = () => {
        pendingDatabase = undefined;
        reject(
          new Error(
            "Another studio tab is blocking a database upgrade. Close older studio tabs and try again.",
          ),
        );
      };
    });
  return pendingDatabase;
}
async function read<T>(
  storeName: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () =>
      reject(
        new Error(
          `Could not read local storage: ${req.error?.message ?? "read failed"}`,
        ),
      );
  });
}
async function write(
  storeName: string,
  action: (store: IDBObjectStore) => void,
): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        new Error(
          `Could not save locally: ${tx.error?.message ?? "write failed"}. Export a backup before closing.`,
        ),
      );
    tx.onabort = () =>
      reject(
        new Error(
          "Local save was interrupted. Export a backup before closing.",
        ),
      );
    try {
      action(tx.objectStore(storeName));
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}
export async function saveProject(project: Project): Promise<void> {
  const valid = validateProject(project);
  await write(PROJECT_STORE, (store) => store.put(valid));
  try {
    localStorage.setItem(LAST_PROJECT, valid.id);
  } catch {
    /* IndexedDB save succeeded; recent-project fallback still loads the latest saved project. */
  }
}
export async function loadProjectById(id: string): Promise<Project | null> {
  const result = await read<Project>(PROJECT_STORE, id);
  return result ? validateProject(result) : null;
}
export async function listProjects(): Promise<
  Array<{ id: string; name: string; updatedAt: string }>
> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, "readonly");
    const req = tx.objectStore(PROJECT_STORE).getAll();
    req.onsuccess = () =>
      resolve(
        (req.result as Project[])
          .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
    req.onerror = () => reject(new Error("Could not list local projects."));
  });
}
export async function loadProject(): Promise<Project | null> {
  let recent: string | null = null;
  try {
    recent = localStorage.getItem(LAST_PROJECT);
  } catch {
    /* Load the latest record when localStorage is blocked. */
  }
  if (recent) {
    const project = await loadProjectById(recent);
    if (project) return project;
  }
  const projects = await listProjects();
  return projects.length ? loadProjectById(projects[0].id) : null;
}
export async function deleteProject(id: string): Promise<void> {
  await write(PROJECT_STORE, (store) => store.delete(id));
  try {
    if (localStorage.getItem(LAST_PROJECT) === id)
      localStorage.removeItem(LAST_PROJECT);
  } catch {
    /* No recent pointer to clear. */
  }
  // Assets are intentionally kept: multiple local project copies may reference the same media.
}
export function validateMediaFile(
  file: Pick<File, "type" | "size" | "name">,
): "image" | "video" {
  const images = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/avif",
  ];
  const videos = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];
  if (file.size === 0) throw new Error("This media file is empty.");
  if (file.size > 2 * 1024 * 1024 * 1024)
    throw new Error("Media files must be smaller than 2 GB.");
  if (images.includes(file.type)) return "image";
  if (videos.includes(file.type)) return "video";
  throw new Error(
    "Choose a PNG, JPEG, WebP, GIF, AVIF, MP4, WebM, Ogg or MOV file. SVG and executable files are not accepted.",
  );
}
export function matchesMediaAsset(
  file: Pick<File, "name" | "type" | "size">,
  asset: MediaAsset,
): boolean {
  return (
    file.name === asset.name &&
    file.type === asset.mime &&
    file.size === asset.size &&
    (file.type.startsWith("video/") ? "video" : "image") === asset.kind
  );
}
export async function saveAsset(
  file: File,
  preferredId?: string,
): Promise<MediaAsset> {
  const kind = validateMediaFile(file);
  if (
    preferredId !== undefined &&
    (!/^[\w.:-]{1,128}$/.test(preferredId) ||
      ["__proto__", "prototype", "constructor"].includes(preferredId))
  ) {
    throw new Error("The media attachment identifier is invalid.");
  }
  const asset: MediaAsset = {
    id: preferredId ?? crypto.randomUUID(),
    name: file.name.slice(0, 255),
    kind,
    mime: file.type,
    size: file.size,
  };
  await write(ASSET_STORE, (store) => store.put({ ...asset, blob: file }));
  return asset;
}
export async function getAssetBlob(id: string): Promise<Blob | null> {
  const asset = await read<MediaAsset & { blob: Blob }>(ASSET_STORE, id);
  return asset?.blob ?? null;
}
export async function getAssetUrl(id: string): Promise<string | null> {
  const blob = await getAssetBlob(id);
  return blob ? URL.createObjectURL(blob) : null;
}
export async function deleteAsset(id: string): Promise<void> {
  await write(ASSET_STORE, (store) => store.delete(id));
}
