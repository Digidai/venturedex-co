import manifest from "../../content/launch-covers.json";
import { launchCoverKey, type LaunchCoverManifest } from "./launch-cover-key";

const covers = (manifest as LaunchCoverManifest).covers;
export function getLaunchCover(item: { video_url: string }) {
  return covers[launchCoverKey(item.video_url)] ?? null;
}
