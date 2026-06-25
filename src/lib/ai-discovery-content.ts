import { buildAiDiscoveryIndex } from "./ai-discovery";
import {
  getContentCollections,
  getContentNewsEligibleFundingRounds,
  getContentStartups,
} from "./content";
import { DEFAULT_SITE_URL } from "./seo";
import { getTopicPages } from "./topic-pages";
import { getPublishedWeeklyIssuesFromContent } from "./weekly";

export function buildVentureDexAiIndexFromContent(siteUrl = DEFAULT_SITE_URL) {
  const startups = getContentStartups();
  const weeklyIssues = getPublishedWeeklyIssuesFromContent(Infinity);
  return buildAiDiscoveryIndex({
    siteUrl,
    startups,
    fundingRounds: getContentNewsEligibleFundingRounds(),
    weeklyIssues,
    topics: getTopicPages(startups, weeklyIssues),
    collections: getContentCollections(),
  });
}
