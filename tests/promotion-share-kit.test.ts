import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPromotionPackMarkdown,
  campaignName,
  oneLine,
  xDraft,
} from "../scripts/promotion/share-kit";
import type { PromotionStartup, PromotionWeeklyIssue } from "../scripts/promotion/content";
import reviewManifest from "../content/screenshot-reviews.json";
import type { ScreenshotMetadata } from "../src/lib/screenshots";

const startup: PromotionStartup = {
  slug: "billables-ai",
  product_name: "Billables AI",
  domain: "billables.ai",
  summary: "AI timekeeping for law firms.\nIncludes narrative context.",
  why_featured: "Legal workflow wedge",
  product_type: "SaaS",
  investors: "Useful Ventures",
  tags: "legal ai",
  published_at: "2026-06-11T00:00:00Z",
  funding: [{
    amount: "$10M",
    stage: "Series A",
    lead_investor: "Useful Ventures",
    date: "2026-06-10",
  }],
};

const weekly: PromotionWeeklyIssue = {
  issue_number: 3,
  title: "AI Is Moving Into the Awkward Work",
  status: "published",
  published_at: "2026-06-08",
  research_summary: "Weekly evidence about awkward workflow automation.",
  editorial_intro: "Intro",
  picks: [{ slug: "billables-ai" }],
};

test("buildPromotionPackMarkdown includes share kit sections and accurate UTM links", () => {
  const markdown = buildPromotionPackMarkdown({
    dailyDate: "2026-06-11",
    dailyStartups: [startup],
    weeklyIssue: weekly,
    generatedAt: new Date("2026-06-12T00:00:00Z"),
  });
  for (const section of [
    "## Canonical URLs",
    "## Daily Additions",
    "## LinkedIn Draft",
    "## X / Threads Drafts",
    "## Founder / Team Share Kit",
    "## Investor Share Kit",
    "## Weekly Issue Share Kit",
    "## Community Review Queue",
  ]) {
    assert.match(markdown, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(markdown, /utm_source=founder&utm_medium=outreach&utm_campaign=venturedex_20260611/);
  assert.match(markdown, /https:\/\/venturedex.co\/og\/weekly-3\.png/);
});

test("weekly-only promotion uses weekly published date for campaign", () => {
  assert.equal(campaignName({ dailyDate: null, dailyStartups: [], weeklyIssue: weekly }), "venturedex_20260608");
});

test("promotion share image uses the reviewed hash and changes when that reviewed hash changes", () => {
  // Isolated in-memory dependency fixture only: never write fake reviews to disk.
  const reviews = reviewManifest.reviews as Record<string, ScreenshotMetadata>;
  const original = reviews[startup.slug];
  try {
    const pack = () => buildPromotionPackMarkdown({ dailyDate: "2026-06-11", dailyStartups: [startup], weeklyIssue: null });
    reviews[startup.slug] = { sha256: "a".repeat(64), width: 1280, height: 720 };
    assert.match(pack(), /Share image: https:\/\/venturedex\.co\/screenshots\/billables-ai\.webp\?v=aaaaaaaaaaaaaaaa/);
    reviews[startup.slug] = { ...reviews[startup.slug], sha256: "b".repeat(64) };
    assert.match(pack(), /Share image: https:\/\/venturedex\.co\/screenshots\/billables-ai\.webp\?v=bbbbbbbbbbbbbbbb/);
  } finally {
    if (original) reviews[startup.slug] = original;
    else delete reviews[startup.slug];
  }
});

test("oneLine and xDraft normalize outreach text safely", () => {
  assert.equal(oneLine("A\n\n  B\tC"), "A B C");
  assert.equal(xDraft("x".repeat(400)).length <= 261, true);
});
