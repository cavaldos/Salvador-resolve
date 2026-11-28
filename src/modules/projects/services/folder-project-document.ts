import { z } from "zod";
import type { Project } from "../types";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const num = z.number();
const text = z.string();
const bool = z.boolean();
const nonnegative = num.nonnegative();
const positive = num.positive();
const clip = z.looseObject({
  id, trackId: id, assetId: id.optional(),
  type: z.enum(["video", "overlay", "text", "audio", "image"]),
  name: text, timelineStart: num, timelineDuration: positive,
  sourceStart: nonnegative, sourceDuration: nonnegative, speed: positive,
  transform: z.looseObject({
    x: num, y: num, width: positive, height: positive,
    scaleX: num, scaleY: num, rotation: num, opacity: num,
    fitMode: z.enum(["contain", "cover", "fill"]),
    crop: z.object({ top: num, right: num, bottom: num, left: num }).optional(),
  }),
  adjustments: z.looseObject({
    brightness: num, contrast: num, saturation: num, blur: num, grayscale: num, sepia: num,
  }),
  audio: z.looseObject({ volume: num, muted: bool, fadeIn: num, fadeOut: num }),
  textStyle: z.looseObject({
    text, fontSize: num, fontFamily: text, color: text,
    textAlign: z.enum(["left", "center", "right"]), fontWeight: z.enum(["normal", "bold"]),
  }).optional(),
  elementStyle: z.looseObject({ fillColor: text }).optional(),
});

const documentSchema = z.object({
  version: z.literal(1),
  project: z.object({
    id, name: text, createdAt: nonnegative, updatedAt: nonnegative, schemaVersion: z.literal(1),
    settings: z.object({
      width: positive, height: positive, aspectRatio: text, fps: positive,
      duration: nonnegative, backgroundColor: text, masterVolume: num,
    }),
    tracks: z.array(z.looseObject({
      id, name: text, type: z.enum(["video", "overlay", "text", "audio"]),
      order: num, hidden: bool, locked: bool, muted: bool, clips: z.array(clip),
    })),
    assetIds: z.array(id),
  }),
  files: z.array(z.object({ id, name: text.regex(/^[^./\\\u0000][^/\\\u0000]*\.(mp4|webm|mov|m4v|mkv)$/i) })),
}).refine(({ files }) =>
  new Set(files.map((file) => file.id)).size === files.length &&
  new Set(files.map((file) => file.name)).size === files.length,
);

export function readFolderProject(document: string) {
  try {
    return documentSchema.parse(JSON.parse(document));
  } catch {
    throw new Error("Cutnora.cutnora.json is invalid or from a newer Cutnora version.");
  }
}

export function writeFolderProject({ folder, ...project }: Project): string {
  return JSON.stringify({ version: 1, project, files: folder?.files ?? [] });
}
