// Server/build-time only. Client search receives one resolved screenshot URL
// per result from search-index.json, never this full review manifest.
import reviewManifest from "../../content/screenshot-reviews.json";

export interface ScreenshotMetadata {
  sha256: string;
  width: number;
  height: number;
}

type ScreenshotReviews = Readonly<Record<string, ScreenshotMetadata>>;
const reviews = reviewManifest.reviews as ScreenshotReviews;
const screenshotKey = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?\.webp$/;

export function getScreenshotMetadata(
  key: string | null | undefined,
  source: ScreenshotReviews = reviews,
): ScreenshotMetadata | undefined {
  if (!key || !screenshotKey.test(key)) return undefined;
  const review = source[key.slice(0, -5)];
  if (!review || !/^[a-f0-9]{64}$/.test(review.sha256)
    || !Number.isInteger(review.width) || !Number.isInteger(review.height)
    || review.width < 1280 || review.height < 720) return undefined;
  return { sha256: review.sha256, width: review.width, height: review.height };
}

export function versionedScreenshotUrl(
  key: string | null | undefined,
  source: ScreenshotReviews = reviews,
): string | null {
  if (!key || !screenshotKey.test(key)) return null;
  const metadata = getScreenshotMetadata(key, source);
  // Unknown fixtures/local drafts can render; the production build gate
  // requires a current review for every catalog image before publication.
  return `/screenshots/${key}${metadata ? `?v=${metadata.sha256.slice(0, 16)}` : ""}`;
}
