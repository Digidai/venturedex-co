export const prerender = true;

import type { APIRoute } from "astro";
import { getPublicLaunchTags, whatShipsSnapshot } from "../lib/whatships";

export const GET: APIRoute = () => {
  const body = JSON.stringify({
    schema_version: 1,
    channel: "launches",
    updated_at: whatShipsSnapshot.source.commit_at,
    item_count: whatShipsSnapshot.item_count,
    items: whatShipsSnapshot.items.map((item) => ({
      id: item.id,
      tweet_id: item.tweet_id,
      slug: item.slug,
      url: `/launches/${item.slug}`,
      title: item.title,
      product: item.product,
      company: item.company,
      category: item.category,
      tags: getPublicLaunchTags(item),
      published_at: item.published_at,
      duration_seconds: item.duration_seconds,
      video_url: item.video_url,
      original_post_url: item.original_post_url,
    })),
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
};
