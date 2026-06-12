import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import {
  WEEKLY_OG_HEIGHT,
  WEEKLY_OG_WIDTH,
  buildWeeklyOgModel,
  renderWeeklyOgSvg,
  weeklyOgPublicPath,
} from "../scripts/weekly-og";
import type { PromotionStartup, PromotionWeeklyIssue } from "../scripts/promotion/content";

const issue: PromotionWeeklyIssue = {
  issue_number: 9,
  title: "AI Is Moving Into the Awkward Work & Operational Gaps",
  status: "published",
  published_at: "2026-06-12",
  research_summary: "A weekly look at companies turning messy workflows into software loops.",
  editorial_intro: "Intro",
  picks: [{ slug: "billables-ai" }, { slug: "jedify" }, { slug: "missing-pick" }],
};

const startups: PromotionStartup[] = [
  {
    slug: "billables-ai",
    product_name: "Billables AI",
    domain: "billables.ai",
    published_at: "2026-06-11T00:00:00Z",
  },
  {
    slug: "jedify",
    product_name: "Jedify",
    domain: "jedify.com",
    published_at: "2026-06-11T00:00:00Z",
  },
];

test("weekly OG model resolves startup names and stable public path", () => {
  const model = buildWeeklyOgModel(issue, startups);
  assert.equal(model.publicPath, "/og/weekly-9.png");
  assert.equal(model.outputPath.endsWith("/public/og/weekly-9.png"), true);
  assert.deepEqual(model.pickNames, ["Billables AI", "Jedify", "missing-pick"]);
});

test("weekly OG SVG has fixed 1200x630 dimensions and escaped text", async () => {
  const model = buildWeeklyOgModel(issue, startups);
  const svg = renderWeeklyOgSvg(model);
  assert.match(svg, /width="1200" height="630"/);
  assert.match(svg, /Awkward Work &amp;/);

  const metadata = await sharp(Buffer.from(svg)).png().metadata();
  assert.equal(metadata.width, WEEKLY_OG_WIDTH);
  assert.equal(metadata.height, WEEKLY_OG_HEIGHT);
});

test("weekly page binds issue-specific OG image instead of default site image", () => {
  const source = readFileSync("src/pages/weekly/[issue].astro", "utf8");
  assert.match(source, /const ogImage = `\/og\/weekly-\$\{issue\.issue_number\}\.png`/);
  assert.match(source, /ogImage=\{ogImage\}/);
  assert.match(source, /ogImageType="image\/png"/);
  assert.equal(weeklyOgPublicPath(3), "/og/weekly-3.png");
});
