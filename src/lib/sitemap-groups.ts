import type { SitemapUrl } from "../pages/sitemap.xml";

export const SITEMAP_GROUPS = ["startups", "investors", "research", "launches"] as const;
export type SitemapGroup = typeof SITEMAP_GROUPS[number];

export function sitemapGroupForPath(path: string): SitemapGroup {
  if (path === "/directory" || path.startsWith("/startups/")) return "startups";
  if (path === "/investors" || path.startsWith("/investors/")) return "investors";
  if (path === "/launches" || path.startsWith("/launches/")) return "launches";
  return "research";
}

export function selectSitemapGroup(urls: SitemapUrl[], group: SitemapGroup): SitemapUrl[] {
  return urls.filter(({ loc }) => sitemapGroupForPath(loc) === group);
}
