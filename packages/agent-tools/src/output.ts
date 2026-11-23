import { z } from "zod";
import { compileToFfmpeg } from "@salvador/core";
import { defineTool, type ToolContext } from "./types";

function renderDir(ctx: ToolContext): string {
  if (!ctx.projectDir) throw new Error("no project folder is open");
  return `${ctx.projectDir}/.salvador`;
}

async function render(
  ctx: ToolContext,
  opts: { preset: "youtube-1080p" | "tiktok-9x16" | "gif" | "audio-only"; name: string },
) {
  const dir = renderDir(ctx);
  const ext = opts.preset === "gif" ? "gif" : opts.preset === "audio-only" ? "m4a" : "mp4";
  const out = `${dir}/${opts.name}-${Date.now()}.${ext}`;
  const jobId = crypto.randomUUID();
  const args = compileToFfmpeg(ctx.project, { preset: opts.preset });
  args.push(out);
  await ctx.host.runFfmpeg(args, { jobId, durationMs: 0 });
  return { summary: `rendered ${out}`, data: { path: out, jobId } };
}

export const renderPreview = defineTool({
  name: "render_preview",
  description: "Render a quick preview MP4 of the current timeline.",
  kind: "output",
  input: z.object({ preset: z.enum(["youtube-1080p", "tiktok-9x16"]).default("youtube-1080p") }),
  async execute(input, ctx) {
    return render(ctx, { preset: input.preset, name: "preview" });
  },
});

export const renderFinal = defineTool({
  name: "render_final",
  description: "Render the final output with a preset.",
  kind: "output",
  input: z.object({
    preset: z.enum(["youtube-1080p", "tiktok-9x16", "gif", "audio-only"]).default("youtube-1080p"),
  }),
  async execute(input, ctx) {
    return render(ctx, { preset: input.preset, name: "final" });
  },
});

export const exportFcpxml = defineTool({
  name: "export_fcpxml",
  description: "Export the timeline as a minimal FCPXML file.",
  kind: "output",
  input: z.object({}),
  async execute(_input, ctx) {
    if (!ctx.host.writeTextFile) throw new Error("text file export is not available in this host");
    const dir = renderDir(ctx);
    const out = `${dir}/timeline.fcpxml`;
    const clips = ctx.project.tracks.flatMap((t) => t.clips.map((c) => ({ track: t.id, ...c })));
    const body = clips
      .map(
        (c) =>
          `    <clip name="${c.id}" offset="${c.startMs}/1000s" duration="${Math.round((c.outMs - c.inMs) / c.speed)}/1000s" start="${c.inMs}/1000s"><asset-clip ref="${c.assetId}"/></clip>`,
      )
      .join("\n");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<fcpxml version="1.9">\n  <resources/>\n  <library>\n  <event name="Salvador Resolve">\n  <project name="${ctx.project.name}">\n  <sequence duration="0s">\n${body}\n  </sequence>\n  </project>\n  </event>\n  </library>\n</fcpxml>\n`;
    await ctx.host.writeTextFile(out, xml);
    return { summary: `exported ${out}`, data: { path: out } };
  },
});

export const exportEdl = defineTool({
  name: "export_edl",
  description: "Export the timeline as a minimal CMX3600 EDL.",
  kind: "output",
  input: z.object({}),
  async execute(_input, ctx) {
    if (!ctx.host.writeTextFile) throw new Error("text file export is not available in this host");
    const dir = renderDir(ctx);
    const out = `${dir}/timeline.edl`;
    const tc = (ms: number) => {
      const total = Math.floor(ms / 1000);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:00`;
    };
    let n = 1;
    const lines = ["TITLE: Salvador Resolve", "FCM: NON-DROP FRAME"];
    for (const t of ctx.project.tracks) {
      for (const c of t.clips) {
        const dur = Math.round((c.outMs - c.inMs) / c.speed);
        lines.push(
          `${String(n).padStart(3, "0")}  AX       V     C        ${tc(c.inMs)} ${tc(c.outMs)} ${tc(c.startMs)} ${tc(c.startMs + dur)}`,
        );
        n++;
      }
    }
    await ctx.host.writeTextFile(out, lines.join("\n") + "\n");
    return { summary: `exported ${out}`, data: { path: out } };
  },
});
