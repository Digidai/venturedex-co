import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = fileURLToPath(new URL("../scripts/smoke-live.py", import.meta.url));
const base = "http://preview.test";
const probe = `
import importlib.util, json, sys
from urllib.parse import urlsplit
spec = importlib.util.spec_from_file_location("smoke_live", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
fixture = json.load(sys.stdin)
requested = []
def mock_fetch(url):
    requested.append(url)
    return fixture["documents"][urlsplit(url).path]
module.fetch = mock_fetch
errors = []
for check in fixture["checks"]:
    if check == "news":
        module.assert_news(fixture["base"], fixture["expected"], errors, fixture.get("expectedRounds"))
    else:
        getattr(module, "assert_" + check)(fixture["base"], fixture["expected"], errors)
print(json.dumps({"errors": errors, "requested": requested}))
`;

function runSmoke(documents: Record<string, string>, checks = ["home", "directory", "news"], expected = 304, expectedRounds?: number) {
  const result = spawnSync("python3", ["-c", probe, scriptPath], {
    input: JSON.stringify({ documents, checks, expected, expectedRounds, base }),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as { errors: string[]; requested: string[] };
}

function cards(count: number) {
  return Array.from({ length: count }, (_, index) => `<a class="card-link" href="/startups/company-${index}">Company ${index}</a>`).join("");
}

function fundingRow(index: number, amount = "$1M", source = `https://source.test/${index}`) {
  return `<tr><td class="cell-company"><a href="/startups/company-${index}">Company ${index}</a></td><td class="cell-round">${amount} Seed</td><td class="cell-date"><time datetime="2026-09-08">Sep 8, 2026</time></td><td class="cell-source"><a href="${source}">Source</a></td></tr>`;
}

function newsPage(path: string, rows: string, next?: string) {
  return `<link rel="canonical" href="https://venturedex.co${path}"><table>${rows}</table>${next ? `<a href="${next}" rel="next">Older rounds</a>` : ""}`;
}

function fixture(count = 304) {
  const documents: Record<string, string> = {
    "/": `VentureDex: browse all ${count} company profiles.<a href="/directory">Browse all startups</a>${cards(Math.min(18, count))}`,
    "/directory": `VentureDex: Browse ${count} company profiles. <p>${count} companies</p>${cards(count)}`,
  };
  const pages = Math.max(1, Math.ceil(count / 50));
  for (let page = 1; page <= pages; page++) {
    const path = page === 1 ? "/news" : `/news/page/${page}`;
    const start = (page - 1) * 50;
    const rows = Array.from({ length: Math.min(50, count - start) }, (_, index) => fundingRow(start + index)).join("");
    documents[path] = newsPage(path, rows, page < pages ? `/news/page/${page + 1}` : undefined);
  }
  return documents;
}

test("smoke accepts the 18-card homepage, full directory, and all 304 rounds across seven pages", () => {
  const result = runSmoke(fixture());
  assert.deepEqual(result.errors, []);
  assert.equal(result.requested.filter((url) => new URL(url).pathname.startsWith("/news")).length, 7);
  assert.ok(result.requested.includes(`${base}/?type=DevTools`));
  assert.ok(result.requested.includes(`${base}/directory?type=DevTools`));
  assert.ok(result.requested.includes(`${base}/directory?sort=newest`));
});

test("the actual homepage coverage copy satisfies the unchanged release smoke contract", () => {
  const source = readFileSync(new URL("../src/pages/index.astro", import.meta.url), "utf8");
  const copy = source.match(/<p class="hero-copy">([\s\S]*?)<\/p>/)?.[1];
  assert.ok(copy, "homepage must have its reader-visible coverage statement");
  const documents = fixture();
  const home = (count: number) => `VentureDex ${copy.replace("{startups.length}", String(count))}<a href="/directory">All companies</a>${cards(18)}`;
  documents["/"] = home(304);
  assert.deepEqual(runSmoke(documents, ["home"]).errors, []);
  documents["/"] = home(303);
  assert.ok(runSmoke(documents, ["home"]).errors.some(error => error.includes("expected 304 total company profiles")));
});

test("smoke rejects full-catalog homepage regressions and a missing directory entrance", () => {
  const documents = fixture();
  documents["/"] = `VentureDex: browse all 304 company profiles.${cards(304)}`;
  const result = runSmoke(documents, ["home"]);
  assert.ok(result.errors.some((error) => error.includes("expected 18")));
  assert.ok(result.errors.some((error) => error.includes("no full-directory entrance")));
});

test("smoke rejects missing directory profiles and stale coverage text", () => {
  const documents = fixture();
  documents["/directory"] = `VentureDex: Browse 303 company profiles. 303 companies ${cards(303)}`;
  const result = runSmoke(documents, ["directory"]);
  assert.ok(result.errors.some((error) => error.includes("directory cards, expected 304")));
  assert.ok(result.errors.some((error) => error.includes("directory coverage count")));
});

test("smoke rejects duplicate directory links even when card counts match", () => {
  const documents = fixture();
  documents["/directory"] = documents["/directory"].replace("/startups/company-303", "/startups/company-302");
  assert.ok(runSmoke(documents, ["directory"]).errors.some((error) => error.includes("duplicate or missing directory")));
});

test("smoke does not accept page one as complete funding coverage", () => {
  const documents = fixture();
  documents["/news"] = documents["/news"].replace(/<a href="\/news\/page\/2" rel="next">.*?<\/a>/, "");
  assert.ok(runSmoke(documents, ["news"]).errors.some((error) => error.includes("expected 304")));
});

test("smoke checks each funding page canonical", () => {
  const documents = fixture();
  documents["/news/page/2"] = documents["/news/page/2"].replace("https://venturedex.co/news/page/2", "https://venturedex.co/news");
  assert.ok(runSmoke(documents, ["news"]).errors.some((error) => error.includes("one absolute canonical for /news/page/2")));
});

test("smoke rejects loops, skipped pages, and cross-origin next links without fetching them", () => {
  for (const target of ["/news/page/2", "/news/page/4", "https://outside.test/news/page/3"]) {
    const documents = fixture();
    documents["/news/page/2"] = documents["/news/page/2"].replace('href="/news/page/3"', `href="${target}"`);
    const result = runSmoke(documents, ["news"]);
    assert.ok(result.errors.some((error) => /looping|unsafe or invalid/.test(error)), target);
    assert.equal(result.requested.filter((url) => url.includes("/news/page/2")).length, 1);
    assert.ok(result.requested.every((url) => url.startsWith(base)));
  }
});

test("smoke rejects duplicate funding rounds, including copies with a different source", () => {
  const documents = fixture();
  documents["/news/page/7"] = newsPage("/news/page/7", [fundingRow(300), fundingRow(301), fundingRow(302), fundingRow(302, "$1M", "https://another.test/source")].join(""));
  const result = runSmoke(documents, ["news"]);
  assert.ok(result.errors.some((error) => error.includes("repeats funding row")));
  assert.ok(result.errors.some((error) => error.includes("303 unique rounds")));
});

test("an independent expected round total allows multiple distinct rounds for one company", () => {
  const documents = fixture(1);
  documents["/news"] = newsPage("/news", fundingRow(0) + fundingRow(0, "$2M"));
  assert.deepEqual(runSmoke(documents, ["news"], 1, 2).errors, []);
  assert.ok(runSmoke(documents, ["news"], 1).errors.some((error) => error.includes("expected 1")));
});

test("smoke accepts small inventories without requiring eighteen homepage cards", () => {
  assert.deepEqual(runSmoke(fixture(3), ["home", "directory", "news"], 3).errors, []);
});
