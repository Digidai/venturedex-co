const CANONICAL_HOST = "venturedex.co";
const STATIC_FILE_RE = /\/[^/]+\.[^/]+$/;
const ONE_HOUR_SECONDS = 3600;
const ONE_WEEK_SECONDS = 604800;
const ONE_YEAR_SECONDS = 31536000;
const CONTENT_SECURITY_POLICY = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://*.clarity.ms",
  "connect-src 'self' https://cloudflareinsights.com https://*.clarity.ms https://c.bing.com",
  "img-src 'self' data: https://*.clarity.ms https://c.bing.com",
].join("; ");

export function canonicalRedirectUrl(input: string | URL, method = "GET"): string | null {
  if (method !== "GET" && method !== "HEAD") return null;

  const url = new URL(input);
  let changed = false;

  if (url.hostname === `www.${CANONICAL_HOST}`) {
    url.hostname = CANONICAL_HOST;
    changed = true;
  }

  if (url.hostname === CANONICAL_HOST && url.protocol === "http:") {
    url.protocol = "https:";
    changed = true;
  }

  const htmlPath = url.pathname.match(/^(.*)\.html\/?$/);
  if (url.pathname.length > 1 && htmlPath && !url.pathname.startsWith("/api/")) {
    const withoutHtml = htmlPath[1] || "/";
    url.pathname = withoutHtml.endsWith("/index")
      ? withoutHtml.slice(0, -"/index".length) || "/"
      : withoutHtml;
    changed = true;
  }

  if (
    url.pathname.length > 1 &&
    url.pathname.endsWith("/") &&
    !url.pathname.startsWith("/api/") &&
    !STATIC_FILE_RE.test(url.pathname)
  ) {
    url.pathname = url.pathname.replace(/\/+$/, "");
    changed = true;
  }

  return changed ? url.toString() : null;
}

export function setSecurityHeaders(headers: Headers): void {
  setDefaultHeader(headers, "X-Content-Type-Options", "nosniff");
  setDefaultHeader(headers, "Referrer-Policy", "strict-origin-when-cross-origin");
  setDefaultHeader(headers, "X-Frame-Options", "DENY");
  setDefaultHeader(headers, "Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  setDefaultHeader(headers, "Content-Security-Policy", CONTENT_SECURITY_POLICY);
}

function setDefaultHeader(headers: Headers, name: string, value: string): void {
  if (!headers.has(name)) headers.set(name, value);
}

export function withSecurityHeaders(response: Response): Response {
  const copy = new Response(response.body, response);
  setSecurityHeaders(copy.headers);
  return copy;
}

export function setStaticAssetCacheHeaders(headers: Headers, pathname: string): void {
  if (pathname.startsWith("/_astro/") || pathname.startsWith("/fonts/")) {
    headers.set("Cache-Control", `public, max-age=${ONE_YEAR_SECONDS}, immutable`);
    return;
  }

  if (pathname === "/search-index.json" || pathname === "/ai-index.json") {
    headers.set("Cache-Control", `public, max-age=300, s-maxage=86400, stale-while-revalidate=${ONE_WEEK_SECONDS}`);
    return;
  }

  if (
    pathname === "/sitemap.xml" ||
    pathname === "/feed.xml" ||
    pathname === "/llms.txt" ||
    pathname === "/llms-full.txt" ||
    pathname === "/robots.txt"
  ) {
    headers.set("Cache-Control", `public, max-age=${ONE_HOUR_SECONDS}`);
    return;
  }

  if (
    pathname.startsWith("/screenshots/") ||
    pathname.startsWith("/logos/") ||
    pathname.startsWith("/og/") ||
    pathname === "/favicon.svg" ||
    pathname === "/og-image.png"
  ) {
    headers.set("Cache-Control", `public, max-age=${ONE_WEEK_SECONDS}`);
  }
}

export function withHttpPolicy(request: Request, response: Response): Response {
  const copy = withSecurityHeaders(response);
  if (copy.ok) {
    const url = new URL(request.url);
    setStaticAssetCacheHeaders(copy.headers, url.pathname);
  }
  return copy;
}
