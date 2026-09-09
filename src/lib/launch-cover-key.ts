import { createHash } from "node:crypto";

export const COVER_RECIPE = "original-frame-v1-640x360-webp72";
export const COVER_WIDTH = 640;
export const COVER_HEIGHT = 360;

export function launchCoverKey(videoUrl: string): string {
  const url = new URL(videoUrl);
  if (url.protocol !== "https:" || url.hostname !== "video.twimg.com" || url.port || url.username || url.password || !url.pathname.endsWith(".mp4")) {
    throw new Error("Cover input must be an original allowlisted MP4");
  }
  return createHash("sha256").update(`${COVER_RECIPE}\n${videoUrl}`).digest("hex").slice(0, 24);
}

export interface LaunchCover { path: string; width: number; height: number; bytes: number }
export interface LaunchCoverManifest { schema_version: 1; recipe: string; covers: Record<string, LaunchCover> }
