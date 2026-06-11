import { defineMiddleware } from "astro:middleware";

const CANONICAL_HOST = "venturedex.co";
const STATIC_FILE_RE = /\/[^/]+\.[^/]+$/;

function setSecurityHeaders(headers: Headers) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  // frame-ancestors/object-src/base-uri don't affect the inline theme + ld+json scripts.
  headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
  );
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.request.method === "GET" || context.request.method === "HEAD") {
    const url = new URL(context.request.url);
    let changed = false;

    if (url.hostname === `www.${CANONICAL_HOST}`) {
      url.hostname = CANONICAL_HOST;
      changed = true;
    }

    if (url.hostname === CANONICAL_HOST && url.protocol === "http:") {
      url.protocol = "https:";
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

    if (changed) {
      return Response.redirect(url.toString(), 301);
    }
  }

  const response = await next();
  setSecurityHeaders(response.headers);
  return response;
});
