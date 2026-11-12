import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
vi.mock("@vercel/blob", () => ({
  get: vi.fn(),
  list: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));
import { get, list, put } from "@vercel/blob";
import handler from "../api/projects";
import { makeSession } from "../server/auth";
import { createProject } from "../src/lib/defaults";

function request(method = "GET", id?: string, body?: unknown): VercelRequest {
  return {
    method,
    query: id ? { id } : {},
    headers: {
      "x-forwarded-proto": "https",
      host: "studio.example",
      origin: "https://studio.example",
      cookie: `studio_session=${makeSession()}`,
    },
    body,
  } as unknown as VercelRequest;
}
function response() {
  const state: {
    code: number;
    body: unknown;
    headers: Record<string, string>;
  } = { code: 200, body: null, headers: {} };
  const res = {
    status: (code: number) => {
      state.code = code;
      return res;
    },
    json: (body: unknown) => {
      state.body = body;
      return res;
    },
    end: () => res,
    setHeader: (key: string, value: string) => {
      state.headers[key] = value;
      return res;
    },
  } as unknown as VercelResponse;
  return { state, res };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STUDIO_PASSWORD", "test-only-password");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-only-storage-token");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("private cloud project boundary", () => {
  it("requires an authenticated studio session before reading storage", async () => {
    const req = request();
    delete req.headers.cookie;
    const { state, res } = response();
    await handler(req, res);
    expect(state.code).toBe(401);
    expect(list).not.toHaveBeenCalled();
    expect(state.headers["Cache-Control"]).toBe("no-store");
  });
  it("blocks cross-origin writes", async () => {
    const req = request("PUT", "project");
    req.headers.origin = "https://different.example";
    const { state, res } = response();
    await handler(req, res);
    expect(state.code).toBe(403);
    expect(put).not.toHaveBeenCalled();
  });
  it("reports missing storage configuration distinctly", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_STORE_ID", "");
    const { state, res } = response();
    await handler(request(), res);
    expect(state.code).toBe(503);
  });
  it("returns 404 for a missing private blob", async () => {
    vi.mocked(get).mockResolvedValue(null);
    const { state, res } = response();
    await handler(request("GET", "missing"), res);
    expect(state.code).toBe(404);
    expect(get).toHaveBeenCalledWith("projects/missing.json", {
      access: "private",
      useCache: false,
    });
  });
  it("loads a validated cloud project including local-media metadata", async () => {
    const project = createProject();
    project.assets = [
      {
        id: "asset1",
        name: "frame.png",
        mime: "image/png",
        kind: "image",
        size: 200,
      },
    ];
    project.scenes[0].mediaId = "asset1";
    project.scenes[0].background = "media";
    vi.mocked(get).mockResolvedValue({
      statusCode: 200,
      stream: new Response(JSON.stringify(project)).body,
      blob: { size: 1000 },
    } as never);
    const { state, res } = response();
    await handler(request("GET", project.id), res);
    expect(state.code).toBe(200);
    expect(state.body).toEqual(project);
  });
  it("identifies corrupt stored projects as storage failures", async () => {
    vi.mocked(get).mockResolvedValue({
      statusCode: 200,
      stream: new Response("broken json").body,
      blob: { size: 20 },
    } as never);
    const { state, res } = response();
    await handler(request("GET", "project1"), res);
    expect(state.code).toBe(502);
    expect(state.body).toMatchObject({
      message: expect.stringContaining("damaged"),
    });
  });
  it("validates the body and matching ID before writing privately", async () => {
    const project = createProject();
    const { state, res } = response();
    await handler(request("PUT", project.id, project), res);
    expect(state.code).toBe(200);
    expect(put).toHaveBeenCalledOnce();
    const [path, body, options] = vi.mocked(put).mock.calls[0];
    expect(path).toBe(`projects/${project.id}.json`);
    expect(JSON.parse(body as string)).toEqual(project);
    expect(options).toMatchObject({
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
    });
    const mismatch = response();
    await handler(request("PUT", "different", project), mismatch.res);
    expect(mismatch.state.code).toBe(400);
  });
  it("rejects unsupported project versions and oversized bodies without Content-Length", async () => {
    const project = createProject();
    const invalid = response();
    await handler(
      request("PUT", project.id, { ...project, version: 2 }),
      invalid.res,
    );
    expect(invalid.state.code).toBe(400);
    expect(put).not.toHaveBeenCalled();
    const oversized = response();
    await handler(
      request("PUT", project.id, { ...project, name: "x".repeat(3_000_001) }),
      oversized.res,
    );
    expect(oversized.state.code).toBe(413);
    expect(put).not.toHaveBeenCalled();
  });
  it("rejects path traversal and missing write identity", async () => {
    const traversal = response();
    await handler(request("GET", "../secrets"), traversal.res);
    expect(traversal.state.code).toBe(400);
    expect(get).not.toHaveBeenCalled();
    const missing = response();
    await handler(request("DELETE"), missing.res);
    expect(missing.state.code).toBe(400);
  });
  it("keeps provider failures distinct from project validation", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(get).mockRejectedValue(
      new Error("upstream temporarily unavailable"),
    );
    const { state, res } = response();
    await handler(request("GET", "project1"), res);
    expect(state.code).toBe(502);
    expect(state.body).toMatchObject({
      message: expect.stringContaining("Your local project is safe"),
    });
  });
});
