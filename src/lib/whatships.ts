import snapshotJson from "../../content/whatships.json";

export interface WhatShipsItem {
  id: string;
  tweet_id: string;
  slug: string;
  title: string;
  product: string;
  company: string;
  category: string;
  source_category?: string;
  tags: string[];
  published_at: string;
  duration_seconds: number | null;
  featured: boolean;
  video_url: string;
  original_post_url: string;
  last_changed_at?: string;
}

export interface WhatShipsSnapshot {
  schema_version: 1;
  channel: "whatships";
  title: string;
  description: string;
  source: {
    name: "whatships.com";
    homepage_url: string;
    repository_url: string;
    data_path: string;
    commit: string;
    commit_url: string;
    commit_at: string;
    raw_data_url: string;
    raw_sha256: string;
  };
  content_policy: {
    mode: "original-video-index";
    media_mirrored: false;
    video_delivery: "remote-original";
    descriptions_mirrored: false;
    attribution: string;
  };
  source_published_through: string;
  item_count: number;
  items: WhatShipsItem[];
}

const CATEGORY_LABELS: Record<string, string> = {
  ai: "AI",
  consumer: "Consumer",
  design: "Design",
  "developer-tools": "Developer tools",
  hardware: "Hardware",
  motion: "Motion",
  other: "Other",
  productivity: "Productivity",
};

const INTERNAL_DISCOVERY_TAGS = new Set([
  "auto-discovery",
  "imported",
  "launchgallery",
  "manual-x-search",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requireHttpsUrl(value: unknown, label: string, allowedHosts?: Set<string>): string {
  const text = requireNonEmptyString(value, label);
  const url = new URL(text);
  if (url.protocol !== "https:") throw new Error(`${label} must use https`);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (allowedHosts && !allowedHosts.has(host)) throw new Error(`${label} has an unexpected host`);
  return text;
}

export function parseWhatShipsSnapshot(value: unknown): WhatShipsSnapshot {
  if (!isRecord(value) || value.schema_version !== 1 || value.channel !== "whatships") {
    throw new Error("Invalid WhatShips snapshot header");
  }
  if (!isRecord(value.source) || !isRecord(value.content_policy) || !Array.isArray(value.items)) {
    throw new Error("Invalid WhatShips snapshot structure");
  }
  if (value.content_policy.mode !== "original-video-index" ||
      value.content_policy.media_mirrored !== false ||
      value.content_policy.video_delivery !== "remote-original" ||
      value.content_policy.descriptions_mirrored !== false) {
    throw new Error("Launch snapshot must use original remote videos without mirroring media");
  }
  requireNonEmptyString(value.title, "WhatShips title");
  requireNonEmptyString(value.description, "WhatShips description");
  requireNonEmptyString(value.content_policy.attribution, "WhatShips attribution");
  const sourceCommit = requireNonEmptyString(value.source.commit, "WhatShips source.commit");
  const rawHash = requireNonEmptyString(value.source.raw_sha256, "WhatShips source.raw_sha256");
  if (!/^[0-9a-f]{40}$/.test(sourceCommit) || !/^[0-9a-f]{64}$/.test(rawHash)) {
    throw new Error("Invalid WhatShips source provenance hash");
  }
  requireHttpsUrl(value.source.homepage_url, "WhatShips source.homepage_url", new Set(["whatships.com"]));
  requireHttpsUrl(value.source.repository_url, "WhatShips source.repository_url", new Set(["github.com"]));
  requireHttpsUrl(value.source.commit_url, "WhatShips source.commit_url", new Set(["github.com"]));
  requireHttpsUrl(value.source.raw_data_url, "WhatShips source.raw_data_url", new Set(["raw.githubusercontent.com"]));
  if (!Number.isFinite(Date.parse(requireNonEmptyString(value.source.commit_at, "WhatShips source.commit_at"))) ||
      !Number.isFinite(Date.parse(requireNonEmptyString(value.source_published_through, "WhatShips source_published_through")))) {
    throw new Error("Invalid WhatShips snapshot provenance date");
  }

  const seenIds = new Set<string>();
  const seenTweets = new Set<string>();
  const seenSlugs = new Set<string>();
  let previousDate = "9999-12-31T23:59:59.999Z";
  let previousSlug = "";
  for (const [index, rawItem] of value.items.entries()) {
    if (!isRecord(rawItem)) throw new Error(`WhatShips item ${index} must be an object`);
    for (const field of ["id", "tweet_id", "slug", "title", "product", "company", "category", "published_at"] as const) {
      if (typeof rawItem[field] !== "string" || !rawItem[field]) {
        throw new Error(`WhatShips item ${index}.${field} must be a non-empty string`);
      }
    }
    const tweetId = rawItem.tweet_id as string;
    const id = rawItem.id as string;
    const slug = rawItem.slug as string;
    const itemCategory = rawItem.category as string;
    const publishedAt = rawItem.published_at as string;
    if (rawItem.last_changed_at !== undefined &&
        (typeof rawItem.last_changed_at !== "string" || !Number.isFinite(Date.parse(rawItem.last_changed_at)))) {
      throw new Error(`WhatShips item ${index}.last_changed_at is invalid`);
    }
    if (!/^\d+$/.test(tweetId) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error(`WhatShips item ${index} has an invalid tweet_id or slug`);
    }
    if (!Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, itemCategory)) {
      throw new Error(`WhatShips item ${index}.category is not allowlisted`);
    }
    if (rawItem.source_category !== undefined &&
        (typeof rawItem.source_category !== "string" || !rawItem.source_category || rawItem.source_category === rawItem.category)) {
      throw new Error(`WhatShips item ${index}.source_category is invalid`);
    }
    if (!Array.isArray(rawItem.tags) || rawItem.tags.length > 12 ||
        !rawItem.tags.every((tag) => typeof tag === "string" && tag.length > 0)) {
      throw new Error(`WhatShips item ${index}.tags must be a string array`);
    }
    if (rawItem.duration_seconds !== null &&
        (typeof rawItem.duration_seconds !== "number" || !Number.isInteger(rawItem.duration_seconds) ||
          rawItem.duration_seconds <= 0 || rawItem.duration_seconds > 43_200)) {
      throw new Error(`WhatShips item ${index}.duration_seconds is invalid`);
    }
    if (typeof rawItem.featured !== "boolean") throw new Error(`WhatShips item ${index}.featured is invalid`);
    const originalPostUrl = requireHttpsUrl(
      rawItem.original_post_url,
      `WhatShips item ${index}.original_post_url`,
      new Set(["x.com"]),
    );
    const videoUrl = requireHttpsUrl(
      rawItem.video_url,
      `WhatShips item ${index}.video_url`,
      new Set(["video.twimg.com"]),
    );
    if (!new RegExp(`^https://x\\.com/[A-Za-z0-9_]{1,32}/status/${tweetId}$`).test(originalPostUrl) ||
        !/^https:\/\/video\.twimg\.com\/.+\.mp4(?:\?.*)?$/i.test(videoUrl)) {
      throw new Error(`WhatShips item ${index} has a non-canonical source URL`);
    }
    if (!Number.isFinite(Date.parse(publishedAt))) {
      throw new Error(`WhatShips item ${index}.published_at is invalid`);
    }
    if (publishedAt > previousDate || (publishedAt === previousDate && slug < previousSlug)) {
      throw new Error("WhatShips items must use deterministic newest-first order");
    }
    previousDate = publishedAt;
    previousSlug = slug;
    if (seenIds.has(id)) throw new Error(`Duplicate WhatShips id ${id}`);
    if (seenTweets.has(tweetId)) throw new Error(`Duplicate WhatShips tweet_id ${tweetId}`);
    if (seenSlugs.has(slug)) throw new Error(`Duplicate WhatShips slug ${slug}`);
    seenIds.add(id);
    seenTweets.add(tweetId);
    seenSlugs.add(slug);
  }

  if (!Number.isInteger(value.item_count) || value.item_count !== value.items.length) {
    throw new Error("WhatShips item_count does not match items");
  }
  return value as unknown as WhatShipsSnapshot;
}

export const whatShipsSnapshot = parseWhatShipsSnapshot(snapshotJson);

export function whatShipsCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category
    .split("-")
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

export function getPublicLaunchTags(item: Pick<WhatShipsItem, "tags" | "product" | "company">): string[] {
  const identityTags = new Set([item.product.toLowerCase(), item.company.toLowerCase()]);
  return item.tags.filter((tag) => {
    const normalized = tag.toLowerCase();
    return !INTERNAL_DISCOVERY_TAGS.has(normalized) && !identityTags.has(normalized);
  });
}

export function getWhatShipsCategoryCounts(items = whatShipsSnapshot.items): Array<{
  id: string;
  label: string;
  count: number;
}> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: whatShipsCategoryLabel(id), count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}
