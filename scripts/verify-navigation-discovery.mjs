import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Inspect actual built HTML, not just template strings. Keep this in the build
// gate so a future taxonomy, footer or metadata edit cannot ship orphan links.
const root = resolve("dist/client");
const read = path => readFileSync(resolve(root, path), "utf8");
const fileFor = path => path === "/" ? "index.html" : `${path.slice(1)}.html`;
const ai = JSON.parse(read("ai-index.json"));
const sitemap = read("sitemap.xml");
const home = read("index.html");
const footer = home.match(/<footer\b[\s\S]*?<\/footer>/)?.[0];
assert.ok(footer, "A semantic shared footer must render");
const nav = home.match(/<div class="nav-tabs"[\s\S]*?<\/div>/)?.[0] ?? "";
assert.equal((nav.match(/<a\b/g) ?? []).length, 7, "Seven desktop navigation destinations must render directly");
assert.equal((home.match(/<section\b[^>]*data-funding-ticker/g) ?? []).length, 1, "One top funding strip must render");
assert.ok(home.indexOf("data-funding-ticker") < home.indexOf('class="home-hero"'), "Funding belongs above the compact hero");
assert.equal((home.match(/fetchpriority="high"/g) ?? []).length, 3, "Keep only the first screenshot row high priority");
assert.ok(ai.categories.length > 0, "At least one nonempty category must be built");

const footerCategories = [...footer.matchAll(/href="(\/categories\/[^"?#]+)"/g)].map(m => m[1]);
assert.deepEqual(new Set(footerCategories), new Set(ai.categories.map(c => new URL(c.url).pathname)), "Footer and machine-readable category membership must agree");
const knownRuntimeRoutes = new Set(["/subscribe", "/about", "/sponsor", "/editorial-policy"]);
const serverChunks = readdirSync(resolve("dist/server/chunks"));
for (const route of knownRuntimeRoutes) {
  assert.match(readFileSync(resolve(`src/pages${route}.astro`), "utf8"), /export const prerender = false;/);
  assert.ok(serverChunks.some(name => name.startsWith(`${route.slice(1)}_`) && name.endsWith(".mjs")), `${route}: runtime page must be compiled`);
}
let linkChecks = 0;
for (const category of [{url:ai.routes.categories, startup_count:null}, ...ai.categories]) {
  const path = new URL(category.url).pathname;
  const html = read(fileFor(path));
  const canonical = html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1];
  assert.equal(canonical, category.url, `${path}: exact self-canonical`);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1, `${path}: one visible heading`);
  assert.ok(sitemap.includes(`<loc>${category.url}</loc>`), `${path}: sitemap discovery`);
  assert.doesNotMatch(html.match(/<meta\b[^>]*name="robots"[^>]*>/)?.[0] ?? "", /noindex/);
  const schemas = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const nodes = schemas.flatMap(s => s["@graph"] ?? [s]);
  assert.ok(nodes.some(n => n["@type"] === "CollectionPage"), `${path}: collection schema`);
  assert.ok(nodes.some(n => n["@type"] === "BreadcrumbList"), `${path}: breadcrumb schema`);
  if (category.startup_count !== null) {
    const cards = [...html.matchAll(/data-slug="([^"]+)"[^>]*data-card/g)].map(m => m[1]);
    const list = nodes.find(n => n["@type"] === "ItemList");
    assert.equal(cards.length, category.startup_count, `${path}: visible inventory matches index`);
    assert.equal(list.numberOfItems, cards.length, `${path}: schema matches visible inventory`);
    assert.deepEqual(list.itemListElement.map(n => new URL(n.url).pathname), cards.map(slug => `/startups/${slug}`), `${path}: schema order matches visible order`);
    assert.ok(html.includes("What this view includes") && html.includes("Start with the evidence"), `${path}: substantive scope and sources`);
  }
  for (const match of html.matchAll(/<a\b[^>]*href="(\/(?!\/)[^"]*)"/g)) {
    const url = new URL(match[1].replaceAll("&amp;", "&"), "https://venturedex.co");
    if (knownRuntimeRoutes.has(url.pathname)) continue;
    const target = url.pathname;
    assert.ok(existsSync(resolve(root, target.slice(1))) || existsSync(resolve(root, fileFor(target))), `${path}: broken internal link ${target}`);
    linkChecks++;
  }
}
console.log(`Navigation discovery: 7 desktop links, ${ai.categories.length} category pages + hub, ${linkChecks} internal links, canonical/schema/sitemap parity passed.`);
