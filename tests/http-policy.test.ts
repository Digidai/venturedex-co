import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CONTENT_SECURITY_POLICY,
  canonicalRedirectUrl,
  withHttpPolicy,
  withSecurityHeaders,
} from "../src/lib/http-policy";

test("canonicalRedirectUrl consolidates host, protocol, .html, and trailing slash", () => {
  assert.equal(
    canonicalRedirectUrl("http://www.venturedex.co/startups/clario.html/"),
    "https://venturedex.co/startups/clario"
  );
  assert.equal(
    canonicalRedirectUrl("https://www.venturedex.co/weekly/3"),
    "https://venturedex.co/weekly/3"
  );
  assert.equal(
    canonicalRedirectUrl("http://venturedex.co/collections/ai-ml/"),
    "https://venturedex.co/collections/ai-ml"
  );
  assert.equal(
    canonicalRedirectUrl("https://venturedex.co/index.html"),
    "https://venturedex.co/"
  );
});

test("canonicalRedirectUrl ignores APIs, static files, and non-idempotent methods", () => {
  assert.equal(canonicalRedirectUrl("https://venturedex.co/api/subscribe/", "GET"), null);
  assert.equal(canonicalRedirectUrl("https://venturedex.co/logos/companies/clario.png", "GET"), null);
  assert.equal(canonicalRedirectUrl("https://venturedex.co/startups/clario/", "POST"), null);
});

test("withSecurityHeaders adds crawl-safe hardening headers", async () => {
  const response = withSecurityHeaders(new Response("ok", { headers: { "Content-Type": "text/plain" } }));

  assert.equal(await response.text(), "ok");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  assert.match(response.headers.get("Strict-Transport-Security") ?? "", /max-age=31536000/);
  const csp = response.headers.get("Content-Security-Policy") ?? "";
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /script-src[^;]*https:\/\/static\.cloudflareinsights\.com/);
  assert.match(csp, /script-src[^;]*https:\/\/\*\.clarity\.ms/);
  assert.match(csp, /connect-src[^;]*https:\/\/cloudflareinsights\.com/);
  assert.match(csp, /connect-src[^;]*https:\/\/\*\.clarity\.ms/);
  assert.match(csp, /connect-src[^;]*https:\/\/c\.bing\.com/);
  assert.match(csp, /img-src[^;]*https:\/\/\*\.clarity\.ms/);
});

test("withSecurityHeaders preserves route-specific stricter headers", () => {
  const response = withSecurityHeaders(new Response("ok", {
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  }));

  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
});

test("static asset header policy stays aligned with runtime CSP", () => {
  const headersFile = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
  assert.match(headersFile, new RegExp(`Content-Security-Policy: ${escapeRegExp(CONTENT_SECURITY_POLICY)}`));
});

test("withHttpPolicy preserves static asset cache rules when Worker runs first", () => {
  assert.equal(
    withHttpPolicy(
      new Request("https://venturedex.co/_astro/index.hash.css"),
      new Response("css")
    ).headers.get("Cache-Control"),
    "public, max-age=31536000, immutable"
  );
  assert.equal(
    withHttpPolicy(
      new Request("https://venturedex.co/fonts/inter.woff2"),
      new Response("font")
    ).headers.get("Cache-Control"),
    "public, max-age=31536000, immutable"
  );
  assert.equal(
    withHttpPolicy(
      new Request("https://venturedex.co/search-index.json"),
      new Response("{}")
    ).headers.get("Cache-Control"),
    "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800"
  );
  assert.equal(
    withHttpPolicy(
      new Request("https://venturedex.co/ai-index.json"),
      new Response("{}")
    ).headers.get("Cache-Control"),
    "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800"
  );
  for (const path of ["/sitemap.xml", "/feed.xml", "/llms.txt", "/llms-full.txt", "/robots.txt"]) {
    assert.equal(
      withHttpPolicy(
        new Request(`https://venturedex.co${path}`),
        new Response("ok")
      ).headers.get("Cache-Control"),
      "public, max-age=3600",
      `${path} should keep a short crawler cache when Worker runs first`
    );
  }
  assert.equal(
    withHttpPolicy(
      new Request("https://venturedex.co/og/weekly-3.png"),
      new Response("png")
    ).headers.get("Cache-Control"),
    "public, max-age=604800"
  );
});

test("withHttpPolicy does not override non-asset cache decisions", () => {
  const response = withHttpPolicy(
    new Request("https://venturedex.co/api/newsletter/unsubscribe"),
    new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } })
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
});

test("withHttpPolicy does not cache missing static assets", () => {
  const missingLogo = withHttpPolicy(
    new Request("https://venturedex.co/logos/missing.png"),
    new Response("not found", { status: 404 })
  );
  const missingAstroAsset = withHttpPolicy(
    new Request("https://venturedex.co/_astro/missing.css"),
    new Response("not found", { status: 404 })
  );

  assert.equal(missingLogo.status, 404);
  assert.equal(missingLogo.headers.get("Cache-Control"), null);
  assert.equal(missingLogo.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(missingAstroAsset.status, 404);
  assert.equal(missingAstroAsset.headers.get("Cache-Control"), null);
  assert.equal(missingAstroAsset.headers.get("X-Content-Type-Options"), "nosniff");
});

test("wrangler keeps long-cache asset paths behind Worker policy", () => {
  const wranglerConfig = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const workerGuardedPaths = [
    "/_astro/*",
    "/fonts/*",
    "/screenshots/*",
    "/logos/*",
    "/og/*",
    "/favicon.svg",
    "/og-image.png",
    "/search-index.json",
    "/ai-index.json",
    "/sitemap.xml",
    "/feed.xml",
    "/llms.txt",
    "/llms-full.txt",
    "/robots.txt",
  ];

  for (const path of workerGuardedPaths) {
    assert.doesNotMatch(
      wranglerConfig,
      new RegExp(`"!${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
      `${path} must not bypass withHttpPolicy; _headers cannot avoid caching 404s by status`
    );
  }
  assert.doesNotMatch(
    wranglerConfig,
    /"!\//,
    "run_worker_first exclusions bypass Worker canonical redirects and route-specific headers"
  );
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
