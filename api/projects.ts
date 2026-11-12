import type { VercelRequest, VercelResponse } from "@vercel/node";
import { get, list, put, del } from "@vercel/blob";
import { requireStudio } from "../server/auth.js";
import { validateProject } from "../src/lib/validation.js";

const MAX_PROJECT_BYTES = 3_000_000;
const validId = (id: string) =>
  /^[\w.:-]{1,128}$/.test(id) &&
  !["__proto__", "constructor", "prototype"].includes(id);
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireStudio(req, res)) return;
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID)
    return res
      .status(503)
      .json({ message: "Private project storage is not connected." });
  const id = typeof req.query.id === "string" ? req.query.id : undefined;
  if (req.query.id !== undefined && (!id || !validId(id)))
    return res.status(400).json({ message: "Invalid project ID." });
  if (!["GET", "PUT", "DELETE"].includes(req.method ?? "")) {
    res.setHeader("Allow", "GET, PUT, DELETE");
    return res.status(405).end();
  }
  if ((req.method === "PUT" || req.method === "DELETE") && !id)
    return res.status(400).json({ message: "A project ID is required." });
  if (req.method === "PUT") {
    // Enforce the actual body size as well as Content-Length, which clients may omit.
    let serialized: string;
    try {
      serialized = JSON.stringify(req.body) ?? "";
    } catch {
      return res.status(400).json({ message: "The project body is invalid." });
    }
    if (
      Number(req.headers["content-length"] ?? 0) > MAX_PROJECT_BYTES ||
      Buffer.byteLength(serialized, "utf8") > MAX_PROJECT_BYTES
    )
      return res
        .status(413)
        .json({ message: "Project is too large. Export locally instead." });
    let project;
    try {
      project = validateProject(req.body);
    } catch {
      return res.status(400).json({ message: "Project validation failed." });
    }
    if (project.id !== id)
      return res.status(400).json({ message: "Project ID does not match." });
    try {
      await put(`projects/${id}.json`, JSON.stringify(project), {
        access: "private",
        contentType: "application/json",
        allowOverwrite: true,
        addRandomSuffix: false,
        cacheControlMaxAge: 60,
      });
      return res.json({ saved: true, updatedAt: project.updatedAt });
    } catch (error) {
      return storageError(res, error);
    }
  }
  try {
    if (req.method === "GET") {
      if (id) {
        const file = await get(`projects/${id}.json`, {
          access: "private",
          useCache: false,
        });
        if (!file)
          return res.status(404).json({ message: "Project not found." });
        if (file.statusCode !== 200)
          return res.status(502).json({
            message:
              "Cloud storage returned an unexpected response. Try loading again.",
          });
        if (file.blob.size > MAX_PROJECT_BYTES)
          return res.status(502).json({
            message:
              "This cloud project exceeds the supported size. Your local project is safe.",
          });
        let project;
        try {
          project = validateProject(await new Response(file.stream).json());
        } catch {
          return res.status(502).json({
            message:
              "This cloud project is damaged or uses an unsupported format. Your local project is safe.",
          });
        }
        if (project.id !== id)
          return res.status(502).json({
            message:
              "The cloud project identity is invalid. Your local project is safe.",
          });
        return res.json(project);
      }
      const cursor =
        typeof req.query.cursor === "string" ? req.query.cursor : undefined;
      if (cursor && cursor.length > 2048)
        return res.status(400).json({ message: "Invalid page cursor." });
      const files = await list({
        prefix: "projects/",
        limit: 1000,
        ...(cursor ? { cursor } : {}),
      });
      return res.json({
        projects: files.blobs.map((file) => ({
          id: file.pathname.replace(/^projects\//, "").replace(/\.json$/, ""),
          updatedAt: file.uploadedAt.toISOString(),
        })),
        cursor: files.cursor,
        hasMore: files.hasMore,
      });
    }
    await del(`projects/${id}.json`);
    return res.json({ deleted: true });
  } catch (error) {
    return storageError(res, error);
  }
}
function storageError(res: VercelResponse, error: unknown) {
  console.error(
    "Project storage failed",
    error instanceof Error ? error.name : "unknown",
  );
  return res.status(502).json({
    message: "Cloud storage is unavailable. Your local project is safe.",
  });
}
