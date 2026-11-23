import { z } from "zod";

// ---------- shared ----------
export const ProjectSettingsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  sampleRate: z.number().int().positive(),
});

export const StreamInfoSchema = z.object({
  index: z.number().int().nonnegative(),
  codecType: z.enum(["video", "audio", "subtitle", "data", "attachment", "unknown"]),
  // Native Option fields serialize as null; keep absent metadata undefined in projects.
  codecName: z.string().nullish().transform((v) => v ?? undefined),
  width: z.number().int().positive().nullish().transform((v) => v ?? undefined),
  height: z.number().int().positive().nullish().transform((v) => v ?? undefined),
  fps: z.number().positive().nullish().transform((v) => v ?? undefined),
  sampleRate: z.number().int().positive().nullish().transform((v) => v ?? undefined),
  channels: z.number().int().positive().nullish().transform((v) => v ?? undefined),
  durationMs: z.number().int().nonnegative().nullish().transform((v) => v ?? undefined),
  bitRate: z.number().int().nonnegative().nullish().transform((v) => v ?? undefined),
});

export const SceneSchema = z.object({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  score: z.number().min(0).max(1).optional(),
});

export const AssetSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  hash: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  streams: z.array(StreamInfoSchema).default([]),
  proxyPath: z.string().optional(),
  transcriptId: z.string().optional(),
  scenes: z.array(SceneSchema).optional(),
});

export const TransitionSchema = z.object({
  type: z.enum(["crossfade", "fade", "wipe", "slide", "none"]).default("crossfade"),
  durationMs: z.number().int().nonnegative(),
});

export const ClipTransitionsSchema = z.object({
  in: TransitionSchema.optional(),
  out: TransitionSchema.optional(),
});

// ---------- v2 Effect discriminated union ----------
const CropEffectSchema = z.object({
  type: z.literal("crop"),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
const ScaleEffectSchema = z.object({
  type: z.literal("scale"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fit: z.enum(["contain", "cover", "fill"]).default("contain"),
});
const ColorAdjustEffectSchema = z.object({
  type: z.literal("colorAdjust"),
  brightness: z.number().optional(),
  contrast: z.number().optional(),
  saturation: z.number().optional(),
  gamma: z.number().optional(),
});
const LutEffectSchema = z.object({
  type: z.literal("lut"),
  path: z.string().min(1),
});
const BlurEffectSchema = z.object({
  type: z.literal("blur"),
  radius: z.number().nonnegative(),
});
const FadeEffectSchema = z.object({
  type: z.literal("fade"),
  inMs: z.number().int().nonnegative().optional(),
  outMs: z.number().int().nonnegative().optional(),
});
const TextEffectSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  x: z.union([z.number(), z.string()]).optional(),
  y: z.union([z.number(), z.string()]).optional(),
  fontSize: z.number().positive().optional(),
  color: z.string().optional(),
  font: z.string().optional(),
});
const ZoomPanEffectSchema = z.object({
  type: z.literal("zoomPan"),
  zoom: z.number().positive().optional(),
  panX: z.number().optional(),
  panY: z.number().optional(),
  durationMs: z.number().int().nonnegative().optional(),
});
const GenericEffectSchema = z.object({
  type: z.string().min(1),
  params: z.record(z.unknown()).default({}),
});

export const SpecificEffectsSchema = z.discriminatedUnion("type", [
  CropEffectSchema,
  ScaleEffectSchema,
  ColorAdjustEffectSchema,
  LutEffectSchema,
  BlurEffectSchema,
  FadeEffectSchema,
  TextEffectSchema,
  ZoomPanEffectSchema,
]);

export const EffectSchema = z.union([SpecificEffectsSchema, GenericEffectSchema]);

export type Effect = z.infer<typeof EffectSchema>;
export type CropEffect = z.infer<typeof CropEffectSchema>;
export type ScaleEffect = z.infer<typeof ScaleEffectSchema>;
export type ColorAdjustEffect = z.infer<typeof ColorAdjustEffectSchema>;
export type LutEffect = z.infer<typeof LutEffectSchema>;
export type BlurEffect = z.infer<typeof BlurEffectSchema>;
export type FadeEffect = z.infer<typeof FadeEffectSchema>;
export type TextEffect = z.infer<typeof TextEffectSchema>;
export type ZoomPanEffect = z.infer<typeof ZoomPanEffectSchema>;
export type GenericEffect = z.infer<typeof GenericEffectSchema>;

export const ClipSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  inMs: z.number().int().nonnegative(),
  outMs: z.number().int().nonnegative(),
  startMs: z.number().int().nonnegative(),
  speed: z.number().positive().default(1),
  volume: z.number().min(0).max(4).default(1),
  effects: z.array(EffectSchema).default([]),
  transitions: ClipTransitionsSchema.optional(),
});

export const TrackSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["video", "audio", "subtitle", "overlay"]),
  clips: z.array(ClipSchema).default([]),
  muted: z.boolean().default(false),
  locked: z.boolean().default(false),
});

export const MarkerSchema = z.object({
  id: z.string().min(1),
  timeMs: z.number().int().nonnegative(),
  label: z.string(),
  color: z.string().optional(),
});

export const ProjectSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string().min(1),
  name: z.string().min(1),
  settings: ProjectSettingsSchema,
  assets: z.array(AssetSchema).default([]),
  tracks: z.array(TrackSchema).default([]),
  markers: z.array(MarkerSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ---------- v1 (legacy) ----------
export const EffectV1Schema = z.object({
  type: z.string().min(1),
  params: z.record(z.unknown()).default({}),
});
export const ClipV1Schema = ClipSchema.extend({
  effects: z.array(EffectV1Schema).default([]),
});
export const ProjectV1Schema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  settings: ProjectSettingsSchema,
  assets: z.array(AssetSchema).default([]),
  tracks: z.array(TrackSchema.extend({ clips: z.array(ClipV1Schema).default([]) })).default([]),
  markers: z.array(MarkerSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;
export type StreamInfo = z.infer<typeof StreamInfoSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type Transition = z.infer<typeof TransitionSchema>;
export type Clip = z.infer<typeof ClipSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Marker = z.infer<typeof MarkerSchema>;
export type Project = z.infer<typeof ProjectSchema>;

export function migrateProject(raw: unknown): Project {
  const v1 = ProjectV1Schema.safeParse(raw);
  if (v1.success) {
    const p = v1.data;
    return ProjectSchema.parse({
      ...p,
      schemaVersion: 2,
      tracks: p.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => ({
          ...c,
          effects: (c.effects as { type: string; params?: Record<string, unknown> }[]).map((e) => {
            const known = ["crop","scale","colorAdjust","lut","blur","fade","text","zoomPan"];
            if (known.includes(e.type)) {
              return { type: e.type, ...(e.params ?? {}) } as Record<string, unknown>;
            }
            return { type: e.type, params: e.params ?? {} };
          }),
        })),
      })),
    });
  }
  return ProjectSchema.parse(raw);
}

export function parseProject(raw: unknown): Project {
  return migrateProject(raw);
}
