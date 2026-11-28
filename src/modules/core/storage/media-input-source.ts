import type { MediaAsset } from "@/modules/projects/types";
import { getMediaSourceRef, resolveMediaAssetBlob, resolveMediaAssetUrl } from "./media-source-service";

export async function resolveMediaInputSource(asset: MediaAsset) {
  const { BlobSource, UrlSource } = await import("mediabunny");
  const { kind } = getMediaSourceRef(asset);
  return kind === "folder" || kind === "remote"
    ? new UrlSource(await resolveMediaAssetUrl(asset))
    : new BlobSource(await resolveMediaAssetBlob(asset));
}
