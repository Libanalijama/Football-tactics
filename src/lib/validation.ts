import { z } from "zod";
import type { Project } from "../types";

const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\w.:-]+$/)
  .refine(
    (value) => !["__proto__", "prototype", "constructor"].includes(value),
    "Reserved identifier",
  );
const label = z.string().max(160);
const color = z.string().regex(/^#[\da-fA-F]{6}$/);
const point = z
  .object({
    x: z.number().finite().min(0).max(100),
    y: z.number().finite().min(0).max(100),
  })
  .strict();
const badge = z
  .string()
  .max(2048)
  .url()
  .refine(
    (value) => new URL(value).protocol === "https:",
    "Badge must use HTTPS",
  );
const player = point.extend({
  id,
  team: z.enum(["home", "away"]),
  number: z.number().int().min(0).max(999),
  name: label,
  role: z.string().max(32),
  onPitch: z.boolean(),
  highlighted: z.boolean().optional(),
});
const annotation = z
  .object({
    id,
    type: z.enum([
      "arrow",
      "pass",
      "curve",
      "freehand",
      "zone",
      "ellipse",
      "highlight",
      "heat",
      "cone",
      "link",
      "distance",
      "text",
    ]),
    points: z.array(point).min(1).max(4000),
    color,
    width: z.number().finite().min(0.5).max(20),
    text: z.string().max(500).optional(),
  })
  .strict();
const keyframe = z
  .object({
    id,
    time: z.number().finite().min(0).max(600),
    positions: z.record(id, point),
    ball: point.optional(),
    ballCarrierId: id.optional(),
  })
  .strict();
const scene = z
  .object({
    id,
    name: label,
    subtitle: z.string().max(300),
    players: z.array(player).max(80),
    annotations: z.array(annotation).max(1000),
    keyframes: z.array(keyframe).max(200),
    duration: z.number().finite().min(0.1).max(600),
    mediaId: id.optional(),
    mediaTime: z.number().finite().min(0).max(86400),
    mediaTransform: z
      .object({
        x: z.number().finite().min(-100).max(100),
        y: z.number().finite().min(-100).max(100),
        scale: z.number().finite().min(0.1).max(4),
        rotation: z.number().finite().min(-180).max(180),
        fit: z.enum(["contain", "cover"]),
      })
      .strict()
      .optional(),
    background: z.enum(["pitch", "media"]),
    pitchTheme: z.enum(["stadium", "midnight"]),
    showNames: z.boolean(),
    showNumbers: z.boolean(),
    showGrid: z.boolean(),
    camera: z.enum(["full", "half"]),
    notes: z.string().max(20000),
    sourceMatchId: id.optional(),
    tactics: z
      .object({
        activeTeam: z.enum(["home", "away"]),
        showShape: z.boolean(),
        showDistances: z.boolean(),
        showTrails: z.boolean(),
        showLines: z.boolean(),
        showBall: z.boolean(),
        ball: point.extend({ carrierId: id.optional() }),
        formation: z.string().max(32).optional(),
        block: z.enum(["low", "mid", "high", "build-out", "custom"]).optional(),
        lineGroups: z.array(z.array(id).max(11)).max(5).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.players.map((p) => p.id)).size !== value.players.length)
      ctx.addIssue({ code: "custom", message: "Duplicate player identifiers" });
    if (
      new Set(value.annotations.map((a) => a.id)).size !==
      value.annotations.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Duplicate annotation identifiers",
      });
    if (
      new Set(value.keyframes.map((k) => k.time)).size !==
      value.keyframes.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Keyframes must have unique times",
      });
    for (const team of ["home", "away"])
      if (value.players.filter((p) => p.team === team && p.onPitch).length > 11)
        ctx.addIssue({
          code: "custom",
          message: "A team may have at most eleven starting players",
        });
    for (const frame of value.keyframes) {
      if (
        frame.ballCarrierId &&
        !value.players.some((p) => p.id === frame.ballCarrierId)
      )
        ctx.addIssue({
          code: "custom",
          message: "Keyframe ball carrier refers to an unknown player",
        });
      if (frame.time > value.duration)
        ctx.addIssue({
          code: "custom",
          message: "Keyframes must be within the scene duration",
        });
      for (const playerId of Object.keys(frame.positions))
        if (!value.players.some((p) => p.id === playerId))
          ctx.addIssue({
            code: "custom",
            message: "Keyframe refers to an unknown player",
          });
    }
    if (
      value.tactics?.ball.carrierId &&
      !value.players.some((p) => p.id === value.tactics!.ball.carrierId)
    )
      ctx.addIssue({
        code: "custom",
        message: "Ball carrier refers to an unknown player",
      });
    for (const group of value.tactics?.lineGroups ?? [])
      if (
        group.some((playerId) => !value.players.some((p) => p.id === playerId))
      )
        ctx.addIssue({
          code: "custom",
          message: "Tactical line refers to an unknown player",
        });
  });
const team = z
  .object({
    name: label,
    shortName: z.string().max(16),
    color,
    formation: z.string().max(32),
    badge: badge.optional(),
  })
  .strict();
const officialPlayer = z
  .object({
    id,
    name: label,
    number: z.number().int().min(0).max(999).nullable(),
    position: z.string().max(80).nullable(),
  })
  .strict();
const officialTeam = z
  .object({
    id,
    name: label,
    shortName: z.string().max(32),
    badge: badge.optional(),
  })
  .strict();
const officialMatch = z
  .object({
    id,
    provider: z.string().min(1).max(80),
    retrievedAt: z.string().datetime(),
    kickoff: z.string().max(80),
    competition: label,
    season: z.string().max(40),
    venue: z.string().max(200).nullable(),
    status: z.string().max(80),
    home: officialTeam,
    away: officialTeam,
    score: z
      .object({
        home: z.number().int().min(0).max(999).nullable(),
        away: z.number().int().min(0).max(999).nullable(),
      })
      .strict(),
    lineups: z
      .array(
        z
          .object({
            teamId: id,
            status: z.enum([
              "confirmed",
              "provider-reported",
              "predicted",
              "unavailable",
            ]),
            formation: z.string().max(32).nullable(),
            starters: z.array(officialPlayer).max(11),
            substitutes: z.array(officialPlayer).max(40),
          })
          .strict(),
      )
      .max(2),
    events: z
      .array(
        z
          .object({
            id,
            minute: z.number().finite().min(0).max(999),
            type: z.string().max(80),
            teamId: id,
            player: label,
            detail: z.string().max(500).optional(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export const projectSchema = z
  .object({
    version: z.literal(1),
    id,
    name: label,
    updatedAt: z.string().datetime(),
    home: team,
    away: team,
    scenes: z.array(scene).min(1).max(200),
    activeSceneId: id,
    assets: z
      .array(
        z
          .object({
            id,
            name: z.string().max(255),
            kind: z.enum(["image", "video"]),
            mime: z.string().max(100),
            size: z
              .number()
              .int()
              .min(0)
              .max(2 * 1024 * 1024 * 1024),
          })
          .strict(),
      )
      .max(200),
    officialMatch: officialMatch.optional(),
    badgesCleared: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.scenes.map((s) => s.id)).size !== value.scenes.length)
      ctx.addIssue({ code: "custom", message: "Duplicate scene identifiers" });
    if (!value.scenes.some((s) => s.id === value.activeSceneId))
      ctx.addIssue({ code: "custom", message: "Active scene is missing" });
    if (new Set(value.assets.map((a) => a.id)).size !== value.assets.length)
      ctx.addIssue({ code: "custom", message: "Duplicate asset identifiers" });
    for (const s of value.scenes)
      if (s.mediaId && !value.assets.some((a) => a.id === s.mediaId))
        ctx.addIssue({
          code: "custom",
          message: "Scene media is not in this project",
        });
  });
export function validateProject(input: unknown): Project {
  const result = projectSchema.safeParse(input);
  if (!result.success)
    throw new Error(
      `This project cannot be opened: ${result.error.issues
        .slice(0, 3)
        .map(
          (issue) => `${issue.path.join(".") || "project"}: ${issue.message}`,
        )
        .join("; ")}`,
    );
  return result.data as Project;
}
export function parseProject(text: string): Project {
  if (text.length > 25 * 1024 * 1024)
    throw new Error("Project files must be smaller than 25 MB.");
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid project JSON.");
  }
  return validateProject(input);
}
