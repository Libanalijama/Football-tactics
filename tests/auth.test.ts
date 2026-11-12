import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeSession,
  readSessionCookie,
  requireStudio,
  sameOrigin,
  sessionCookie,
  verifySession,
} from "../server/auth.js";
import session from "../api/session.js";
import football from "../api/football.js";

function request(overrides: Record<string, unknown> = {}): VercelRequest {
  return {
    method: "GET",
    headers: {
      host: "studio.example",
      origin: "https://studio.example",
      "x-forwarded-proto": "https",
    },
    query: {},
    body: {},
    ...overrides,
  } as unknown as VercelRequest;
}
function response() {
  const value = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    status: vi.fn((code: number) => {
      value.statusCode = code;
      return value;
    }),
    json: vi.fn((body: unknown) => {
      value.body = body;
      return value;
    }),
    setHeader: vi.fn((name: string, content: unknown) => {
      value.headers[name.toLowerCase()] = content;
      return value;
    }),
    end: vi.fn(() => value),
  };
  return value;
}
const asResponse = (value: ReturnType<typeof response>) =>
  value as unknown as VercelResponse;

beforeEach(() => {
  vi.stubEnv("STUDIO_PASSWORD", "test-only-long-studio-password");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("FOOTBALL_API_KEY", "");
  vi.stubEnv("BLOB_STORE_ID", "");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("signed studio sessions", () => {
  it("authenticates fresh random sessions and rejects tampering", () => {
    const token = makeSession();
    expect(verifySession(token)).toBe(true);
    expect(makeSession()).not.toBe(token);
    expect(
      verifySession(token.replace(/.$/, token.endsWith("A") ? "B" : "A")),
    ).toBe(false);
    expect(verifySession(token.replace(/^\d+/, "9999999999999999"))).toBe(
      false,
    );
    expect(verifySession("x".repeat(10000))).toBe(false);
    expect(verifySession("12.bad.bad")).toBe(false);
  });
  it("expires at twelve hours and invalidates sessions on secret rotation", () => {
    vi.useFakeTimers();
    const token = makeSession();
    vi.advanceTimersByTime(12 * 60 * 60 * 1000 - 1);
    expect(verifySession(token)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(verifySession(token)).toBe(false);
    const fresh = makeSession();
    vi.stubEnv("STUDIO_PASSWORD", "rotated-password");
    expect(verifySession(fresh)).toBe(false);
    vi.stubEnv("STUDIO_PASSWORD", "");
    expect(verifySession(fresh)).toBe(false);
    expect(() => makeSession()).toThrow("not configured");
  });
  it("sets cookie protections and parses only the exact cookie name", () => {
    expect(sessionCookie("token", true)).toContain(
      "HttpOnly; SameSite=Strict; Path=/; Max-Age=43200; Secure",
    );
    expect(sessionCookie("token", false)).not.toContain("; Secure");
    const req = request({
      headers: { cookie: "other=one; studio_session=valid; unrelated=two" },
    });
    expect(readSessionCookie(req)).toBe("valid");
    expect(
      readSessionCookie(
        request({ headers: { cookie: "not_studio_session=bad" } }),
      ),
    ).toBe("");
  });
});

describe("origin and session guards", () => {
  it("requires the exact HTTP(S) origin, including scheme and port", () => {
    expect(sameOrigin(request())).toBe(true);
    for (const origin of [
      "https://evil.example",
      "http://studio.example",
      "ftp://studio.example",
      "https://studio.example:444",
      "https://studio.example/other",
      "https://user:pass@studio.example",
      "null",
    ]) {
      expect(
        sameOrigin(
          request({
            headers: {
              host: "studio.example",
              origin,
              "x-forwarded-proto": "https",
            },
          }),
        ),
      ).toBe(false);
    }
    expect(
      sameOrigin(
        request({ method: "POST", headers: { host: "studio.example" } }),
      ),
    ).toBe(false);
    expect(
      sameOrigin(
        request({ method: "GET", headers: { host: "studio.example" } }),
      ),
    ).toBe(true);
    expect(
      sameOrigin(
        request({
          method: "POST",
          headers: { host: "localhost:3000", origin: "http://localhost:3000" },
        }),
      ),
    ).toBe(true);
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "development");
    expect(
      sameOrigin(
        request({
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "x-forwarded-proto": "http",
          },
        }),
      ),
    ).toBe(true);
  });
  it("blocks missing configuration, unsigned sessions and cross-origin mutations", () => {
    let res = response();
    vi.stubEnv("STUDIO_PASSWORD", "");
    expect(requireStudio(request(), asResponse(res))).toBe(false);
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ configured: false });
    vi.stubEnv("STUDIO_PASSWORD", "test-only-long-studio-password");
    res = response();
    expect(requireStudio(request(), asResponse(res))).toBe(false);
    expect(res.statusCode).toBe(401);
    const token = makeSession();
    res = response();
    expect(
      requireStudio(
        request({
          method: "PUT",
          headers: {
            host: "studio.example",
            origin: "https://evil.example",
            cookie: `studio_session=${token}`,
            "x-forwarded-proto": "https",
          },
        }),
        asResponse(res),
      ),
    ).toBe(false);
    expect(res.statusCode).toBe(403);
    res = response();
    expect(
      requireStudio(
        request({
          headers: {
            host: "studio.example",
            cookie: `studio_session=${token}`,
          },
        }),
        asResponse(res),
      ),
    ).toBe(true);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("session endpoint", () => {
  it("exposes configuration status without leaking secrets", () => {
    const res = response();
    session(request(), asResponse(res));
    expect(res.body).toEqual({
      configured: true,
      authenticated: false,
      cloud: false,
    });
    expect(JSON.stringify(res.body)).not.toContain(process.env.STUDIO_PASSWORD);
  });
  it("requires origin and correct password, then accepts the issued cookie", () => {
    let res = response();
    session(
      request({
        method: "POST",
        headers: { host: "studio.example" },
        body: { password: process.env.STUDIO_PASSWORD },
      }),
      asResponse(res),
    );
    expect(res.statusCode).toBe(403);
    res = response();
    session(
      request({ method: "POST", body: { password: "incorrect" } }),
      asResponse(res),
    );
    expect(res.statusCode).toBe(401);
    res = response();
    session(
      request({
        method: "POST",
        body: { password: process.env.STUDIO_PASSWORD },
      }),
      asResponse(res),
    );
    expect(res.body).toEqual({ authenticated: true });
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toContain("; Secure");
    const status = response();
    session(request({ headers: { cookie } }), asResponse(status));
    expect(status.body).toMatchObject({ authenticated: true });
  });
  it("rate-limits repeated incorrect login attempts", () => {
    for (let count = 0; count < 8; count++) {
      const res = response();
      session(
        request({
          method: "POST",
          headers: {
            host: "studio.example",
            origin: "https://studio.example",
            "x-forwarded-proto": "https",
            "x-forwarded-for": "192.0.2.88",
          },
          body: { password: "incorrect" },
        }),
        asResponse(res),
      );
      expect(res.statusCode).toBe(401);
    }
    const blocked = response();
    session(
      request({
        method: "POST",
        headers: {
          host: "studio.example",
          origin: "https://studio.example",
          "x-forwarded-proto": "https",
          "x-forwarded-for": "192.0.2.88",
        },
        body: { password: process.env.STUDIO_PASSWORD },
      }),
      asResponse(blocked),
    );
    expect(blocked.statusCode).toBe(429);
  });
  it("clears sessions on same-origin logout and rejects unsupported methods", () => {
    let res = response();
    session(request({ method: "DELETE" }), asResponse(res));
    expect(res.headers["set-cookie"]).toContain("Max-Age=0; Secure");
    expect(res.body).toEqual({ authenticated: false });
    res = response();
    session(request({ method: "PATCH" }), asResponse(res));
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe("GET, POST, DELETE");
  });
});

describe("football authentication", () => {
  it("makes only provider configuration status public and guards data", async () => {
    let res = response();
    await football(request({ query: { op: "status" } }), asResponse(res));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ configured: false });
    res = response();
    await football(
      request({ query: { op: "teams", q: "Club" } }),
      asResponse(res),
    );
    expect(res.statusCode).toBe(401);
    res = response();
    await football(
      request({
        query: { op: "teams", q: "Club" },
        headers: {
          host: "studio.example",
          cookie: `studio_session=${makeSession()}`,
        },
      }),
      asResponse(res),
    );
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({
      configured: false,
      error: "NOT_CONFIGURED",
    });
  });
});
