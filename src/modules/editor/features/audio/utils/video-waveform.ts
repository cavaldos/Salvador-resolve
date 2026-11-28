import { resolveMediaInputSource } from "@/modules/core/storage/media-input-source";
import type { MediaAsset } from "@/modules/projects/types";

const cache = new Map<string, Promise<number[]>>();

async function decodeVideoWaveform(asset: MediaAsset) {
  const duration = asset.duration ?? 0;
  // shortcut: skip waveform decoding beyond 20 minutes until it can run in a worker.
  if (duration <= 0 || duration > 1200) return [];
  const { ALL_FORMATS, AudioBufferSink, Input } = await import("mediabunny");
  const input = new Input({ formats: ALL_FORMATS, source: await resolveMediaInputSource(asset) });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) return [];
    const peaks = new Float32Array(Math.max(200, Math.min(2400, Math.ceil(duration * 40))));
    for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers(0, duration)) {
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const samples = buffer.getChannelData(channel);
        for (let index = 0; index < samples.length; index += 8) {
          const bin = Math.floor((timestamp + index / buffer.sampleRate) * peaks.length / duration);
          if (bin >= 0 && bin < peaks.length) peaks[bin] = Math.max(peaks[bin], Math.abs(samples[index]));
        }
      }
    }
    const max = Math.max(...peaks, 0.01);
    return Array.from(peaks, (peak) => Math.sqrt(peak / max));
  } finally {
    input.dispose();
  }
}

export function getVideoWaveform(asset: MediaAsset) {
  const key = asset.source?.kind === "folder"
    ? JSON.stringify([asset.id, asset.source.folderId, asset.source.modifiedAt])
    : asset.id;
  const cached = cache.get(key);
  if (cached) return cached;
  if (cache.size >= 48) cache.delete(cache.keys().next().value ?? "");
  const pending = decodeVideoWaveform(asset).catch(() => []);
  cache.set(key, pending);
  return pending;
}
