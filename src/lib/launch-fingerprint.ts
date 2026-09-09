import { createHash } from "node:crypto";
import snapshot from "../../content/whatships.json";
import covers from "../../content/launch-covers.json";

// Public digest verifies deployed inventory AND cover manifest, not a timestamp.
export const launchCatalogFingerprint = createHash("sha256")
  .update(JSON.stringify({ snapshot, covers })).digest("hex");
