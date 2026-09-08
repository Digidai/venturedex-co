import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import data from "../content/research-briefs.json";
import { getResearchBriefs, researchBriefMarkdown, researchBriefPath, researchBriefResource, validateResearchBriefs } from "../src/lib/research-briefs";
import { withHttpPolicy } from "../src/lib/http-policy";
import { GET as jsonGet } from "../src/pages/research/[slug].json";
import { GET as markdownGet } from "../src/pages/research/[slug].md";
import { selectChangedUrls } from "../scripts/promotion/deploy-discovery";
import { validateUrl } from "../scripts/promotion/indexnow";

const knownSlugs = new Set(readdirSync(new URL("../content/startups/", import.meta.url)).filter((file) => file.endsWith(".json")).map((file) => JSON.parse(readFileSync(new URL(`../content/startups/${file}`, import.meta.url), "utf8")).slug));
const fresh = () => structuredClone(data);

test("published briefs have complete source references and existing company paths", () => {
  assert.equal(validateResearchBriefs(data, knownSlugs).length, 1);
  const brief = getResearchBriefs()[0];
  assert.equal(brief.companies.length, 3);
  assert.equal(brief.sources.length, 10);
  assert.equal(researchBriefPath(brief), "/research/coding-agent-verification-stack");
  assert.match(brief.scope, /no customer deployment or paid trial/);
});

for (const [name, mutate] of [
  ["duplicate brief", (d: any) => d.push(structuredClone(d[0]))],
  ["bad route slug", (d: any) => { d[0].slug = "../admin"; }],
  ["empty method", (d: any) => { d[0].method = []; }],
  ["invalid calendar date", (d: any) => { d[0].reviewed_at = "2026-02-31"; }],
  ["review before publication", (d: any) => { d[0].reviewed_at = "2026-09-07"; }],
  ["source after review", (d: any) => { d[0].sources[0].checked_at = "2026-09-09"; }],
  ["insecure source", (d: any) => { d[0].sources[0].url = "http://example.com"; }],
  ["source credentials", (d: any) => { d[0].sources[0].url = "https://user:secret@example.com"; }],
  ["unknown source type", (d: any) => { d[0].sources[0].type = "independently-proven"; }],
  ["duplicate source", (d: any) => { d[0].sources.push(d[0].sources[0]); }],
  ["unknown company", (d: any) => { d[0].companies[0].startup_slug = "not-in-catalog"; }],
  ["duplicate company", (d: any) => { d[0].companies.push(d[0].companies[0]); }],
  ["unresolved source", (d: any) => { d[0].findings[0].source_ids = ["made-up"]; }],
  ["duplicate source reference", (d: any) => { d[0].findings[0].source_ids = ["niteshift_docs", "niteshift_docs"]; }],
  ["duplicate finding", (d: any) => { d[0].findings.push(d[0].findings[0]); }],
  ["missing answer", (d: any) => { delete d[0].questions[0].answer; }],
] as const) {
  test(`brief validation rejects ${name}`, () => {
    const candidate = fresh(); mutate(candidate);
    assert.throws(() => validateResearchBriefs(candidate, knownSlugs));
  });
}

test("JSON and Markdown retain source policy, product boundaries and editorial conclusions", () => {
  const brief = getResearchBriefs()[0];
  const resource = researchBriefResource(brief);
  assert.equal(resource.kind, "editorial-research");
  assert.ok(resource.findings.every((finding) => finding.kind === "editorial-analysis"));
  assert.match(resource.evidence_policy, /not an independent product benchmark/);
  const markdown = researchBriefMarkdown(brief);
  for (const company of brief.companies) {
    assert.ok(markdown.includes(company.documented_workflow));
    assert.ok(markdown.includes(company.boundary));
    assert.ok(markdown.includes(`/startups/${company.startup_slug}`));
  }
  for (const source of brief.sources) assert.ok(markdown.includes(source.url));
  assert.match(markdown, /proposed, not tested/);
  assert.ok(Buffer.byteLength(JSON.stringify(resource)) < 30000);
  assert.ok(Buffer.byteLength(markdown) < 30000);
});

test("brief endpoints return the matching format and canonical, unknown slugs fail closed", async () => {
  const slug = getResearchBriefs()[0].slug;
  for (const [format, get, mime] of [["json", jsonGet, "application/json"], ["md", markdownGet, "text/markdown"]] as const) {
    const response = await get({ params: { slug } } as any);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("content-type")?.startsWith(mime));
    const wrapped = withHttpPolicy(new Request(`https://venturedex.co/research/${slug}.${format}`), response);
    assert.equal(wrapped.headers.get("link"), `<https://venturedex.co/research/${slug}>; rel="canonical"`);
    assert.match(wrapped.headers.get("cache-control")!, /max-age=300/);
    const missing = await get({ params: { slug: "absent" } } as any);
    assert.equal(missing.status, 404);
    const notFound = withHttpPolicy(new Request(`https://venturedex.co/research/absent.${format}`), missing);
    assert.equal(notFound.headers.get("link"), null);
    assert.doesNotMatch(notFound.headers.get("content-type") ?? "", /application\/json|text\/markdown/);
  }
});

test("sitemap uses canonical brief paths and authored research dates; HTML build validates company references", () => {
  const source = readFileSync(new URL("../src/pages/sitemap.xml.ts", import.meta.url), "utf8");
  assert.match(source, /briefs\.map\(\(brief\) => \(\{ loc: researchBriefPath\(brief\), lastmod: brief\.reviewed_at/);
  assert.match(source, /getTopicResearch\(topic\)\?\.checked_at/);
  const page = readFileSync(new URL("../src/pages/research/[slug].astro", import.meta.url), "utf8");
  assert.match(page, /getResearchBriefs\(new Set\(getContentStartups\(\)/);
});

test("post-release discovery selects changed published briefs but excludes drafts and alternate formats", () => {
  const path = "content/research-briefs.json";
  const current = (file: string) => file === path ? data : null;
  const empty = () => null;
  const expected = ["https://venturedex.co/research", "https://venturedex.co/research/coding-agent-verification-stack"];
  assert.deepEqual(selectChangedUrls([path], current, empty).urls, expected);
  assert.deepEqual(selectChangedUrls(["src/pages/research/[slug].md.ts"], current, empty).urls, expected);
  assert.deepEqual(selectChangedUrls([path], current, current).urls, []);
  const draft = (file: string) => file === path ? [{ ...data[0], status: "draft" }] : null;
  assert.deepEqual(selectChangedUrls([path], draft, current).urls, ["https://venturedex.co/research"]);
  for (const url of expected) assert.doesNotThrow(() => validateUrl(url));
  assert.throws(() => validateUrl(expected[1] + ".json"));
  assert.throws(() => validateUrl(expected[1] + ".md"));
});

test("topic evidence discovery only notifies changed guides and handles guide removal without unrelated topics", () => {
  const path = "content/topic-research.json";
  const configs = [{ slug: "ai-agent-startups" }, { slug: "developer-tools-startups" }, { slug: "legal-ai-startups" }];
  const before = [{ topic_slug: "ai-agent-startups", selection_note: "old" }, { topic_slug: "developer-tools-startups", selection_note: "same" }];
  const after = [{ topic_slug: "ai-agent-startups", selection_note: "new" }, before[1]];
  const read = (data: unknown) => (file: string) => file === path ? data : file === "content/topic-pages.json" ? configs : null;
  assert.deepEqual(selectChangedUrls([path], read(after), read(before)).urls, ["https://venturedex.co/topics", "https://venturedex.co/topics/ai-agent-startups"]);
  assert.deepEqual(selectChangedUrls([path], read(after), read(after)).urls, []);
  assert.deepEqual(selectChangedUrls([path], read([before[1]]), read(before)).urls, ["https://venturedex.co/topics", "https://venturedex.co/topics/ai-agent-startups"]);
});
