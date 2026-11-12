import { timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  makeSession,
  sessionCookie,
  verifySession,
  sameOrigin,
  readSessionCookie,
  secureRequest,
} from "../server/auth.js";
const attempts = new Map<string, { count: number; until: number }>();
export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    return res.json({
      configured: !!process.env.STUDIO_PASSWORD,
      authenticated: verifySession(readSessionCookie(req)),
      cloud: !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID),
    });
  }
  if (!["POST", "DELETE"].includes(req.method ?? "")) {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).end();
  }
  if (!sameOrigin(req))
    return res.status(403).json({ message: "Request origin is not allowed." });
  if (req.method === "DELETE") {
    res.setHeader(
      "Set-Cookie",
      `studio_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureRequest(req) ? "; Secure" : ""}`,
    );
    return res.json({ authenticated: false });
  }
  if (!process.env.STUDIO_PASSWORD)
    return res.status(503).json({
      message: "Set STUDIO_PASSWORD in Vercel to enable secure cloud features.",
    });
  const key = String(req.headers["x-forwarded-for"] ?? "unknown").split(",")[0];
  const item = attempts.get(key);
  if (item && item.until > Date.now() && item.count >= 8)
    return res
      .status(429)
      .json({ message: "Too many attempts. Try again in 15 minutes." });
  if (attempts.size > 1000) attempts.clear();
  const password =
    typeof req.body?.password === "string" && req.body.password.length <= 1024
      ? req.body.password
      : "";
  const a = Buffer.from(password),
    b = Buffer.from(process.env.STUDIO_PASSWORD);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    attempts.set(key, {
      count: item && item.until > Date.now() ? item.count + 1 : 1,
      until: Date.now() + 900000,
    });
    return res
      .status(401)
      .json({ message: "The studio password is incorrect." });
  }
  attempts.delete(key);
  res.setHeader("Set-Cookie", sessionCookie(makeSession(), secureRequest(req)));
  return res.json({ authenticated: true });
}
