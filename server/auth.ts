import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const MAX_AGE = 60 * 60 * 12;
const signature = (value: string) =>
  createHmac("sha256", process.env.STUDIO_PASSWORD ?? "")
    .update(value)
    .digest("base64url");

export function makeSession(): string {
  if (!process.env.STUDIO_PASSWORD)
    throw new Error("Studio authentication is not configured.");
  const value = `${Date.now() + MAX_AGE * 1000}.${randomBytes(16).toString("hex")}`;
  return `${value}.${signature(value)}`;
}

export function verifySession(token: string): boolean {
  if (!process.env.STUDIO_PASSWORD || token.length > 160) return false;
  const parts = token.split(".");
  if (
    parts.length !== 3 ||
    !/^\d{1,16}$/.test(parts[0]) ||
    !/^[a-f0-9]{32}$/.test(parts[1]) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[2])
  )
    return false;
  const expires = Number(parts[0]);
  const now = Date.now();
  if (
    !Number.isSafeInteger(expires) ||
    expires <= now ||
    expires > now + MAX_AGE * 1000 + 60_000
  )
    return false;
  const actual = Buffer.from(parts[2]);
  const expected = Buffer.from(signature(`${parts[0]}.${parts[1]}`));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function secureRequest(req: VercelRequest): boolean {
  const forwarded = req.headers["x-forwarded-proto"];
  if (forwarded === "https") return true;
  if (forwarded === "http") return false;
  return process.env.VERCEL === "1" && process.env.VERCEL_ENV !== "development";
}

export function sameOrigin(req: VercelRequest): boolean {
  const origin = req.headers.origin;
  if (!origin) return req.method === "GET" || req.method === "HEAD";
  if (typeof origin !== "string" || typeof req.headers.host !== "string")
    return false;
  try {
    const incoming = new URL(origin);
    const expected = new URL(
      `${secureRequest(req) ? "https" : "http"}://${req.headers.host}`,
    );
    return (
      ["http:", "https:"].includes(incoming.protocol) &&
      !incoming.username &&
      !incoming.password &&
      !incoming.search &&
      !incoming.hash &&
      incoming.pathname === "/" &&
      !expected.username &&
      !expected.password &&
      incoming.origin === expected.origin
    );
  } catch {
    return false;
  }
}

export function readSessionCookie(req: VercelRequest): string {
  return (
    (req.headers.cookie ?? "")
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("studio_session="))
      ?.slice(15) ?? ""
  );
}

export function requireStudio(
  req: VercelRequest,
  res: VercelResponse,
): boolean {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.STUDIO_PASSWORD) {
    res.status(503).json({
      error: "studio_unconfigured",
      message:
        "Set STUDIO_PASSWORD in the Vercel project to enable secure cloud features.",
      configured: false,
    });
    return false;
  }
  if (!verifySession(readSessionCookie(req))) {
    res.status(401).json({
      error: "unauthorized",
      message: "Unlock the studio to use cloud services.",
    });
    return false;
  }
  if (!sameOrigin(req)) {
    res.status(403).json({
      error: "origin_rejected",
      message: "Request origin is not allowed.",
    });
    return false;
  }
  return true;
}

export function sessionCookie(token: string, secure: boolean): string {
  return `studio_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${MAX_AGE}${secure ? "; Secure" : ""}`;
}
