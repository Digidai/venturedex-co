import {
  DEFAULT_SOCIAL_IMAGE,
  SITE_NAME,
  absoluteUrl,
} from "./seo";

export const SOCIAL_IMAGE_WIDTH = 1200;
export const SOCIAL_IMAGE_HEIGHT = 630;
export const SOCIAL_IMAGE_TYPE = "image/png";

export interface SocialPreviewInput {
  title: string;
  siteUrl: string;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageType?: string;
  twitterSite?: string;
}

export interface SocialPreviewMeta {
  imageUrl: string;
  imageSecureUrl: string | null;
  imageWidth?: number;
  imageHeight?: number;
  imageType?: string;
  imageAlt: string;
  twitterSite: string | null;
}

export function normalizeTwitterHandle(handle: string | undefined): string | null {
  const value = handle?.trim();
  if (!value) return null;

  const normalized = value.startsWith("@") ? value : `@${value}`;
  return /^@[A-Za-z0-9_]{1,15}$/.test(normalized) ? normalized : null;
}

export function resolveSocialPreviewMeta(input: SocialPreviewInput): SocialPreviewMeta {
  const usesDefaultImage = !input.image;
  const imageUrl = absoluteUrl(input.image ?? DEFAULT_SOCIAL_IMAGE, input.siteUrl);
  const imageWidth = input.imageWidth ?? (usesDefaultImage ? SOCIAL_IMAGE_WIDTH : undefined);
  const imageHeight = input.imageHeight ?? (usesDefaultImage ? SOCIAL_IMAGE_HEIGHT : undefined);
  const imageType = input.imageType ?? (usesDefaultImage ? SOCIAL_IMAGE_TYPE : undefined);

  return {
    imageUrl,
    imageSecureUrl: imageUrl.startsWith("https://") ? imageUrl : null,
    imageWidth,
    imageHeight,
    imageType,
    imageAlt: `${input.title} on ${SITE_NAME}`,
    twitterSite: normalizeTwitterHandle(input.twitterSite),
  };
}
