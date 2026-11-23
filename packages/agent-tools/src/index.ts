export * from "./types";
export * from "./inspect";
export * from "./edit";
export * from "./output";

import * as inspect from "./inspect";
import * as edit from "./edit";
import * as output from "./output";
import type { ToolDefinition } from "./types";

export const ALL_TOOLS: ToolDefinition[] = [
  inspect.listAssets,
  inspect.probeAsset,
  inspect.getTimeline,
  inspect.transcribe,
  inspect.searchTranscript,
  inspect.detectSilence,
  inspect.detectScenes,
  inspect.describeFrames,
  edit.addClipTool,
  edit.trimClipTool,
  edit.splitClipTool,
  edit.moveClipTool,
  edit.deleteClipTool,
  edit.rippleDeleteTool,
  edit.removeSilencesTool,
  edit.removeFillerWordsTool,
  edit.setSpeedTool,
  edit.setVolumeTool,
  edit.addFadeTool,
  edit.addTransitionTool,
  edit.addTextOverlayTool,
  edit.addSubtitlesTool,
  edit.cropReframeTool,
  edit.addMusicTool,
  edit.colorAdjustTool,
  edit.applyLutTool,
  output.renderPreview,
  output.renderFinal,
  output.exportFcpxml,
  output.exportEdl,
];

export function findTool(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}
