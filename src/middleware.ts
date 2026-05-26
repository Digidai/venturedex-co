import { defineMiddleware } from "astro:middleware";

const CANONICAL_HOST = "venturedex.co";
const STATIC_FILE_RE = /\/[^/]+\.[^/]+$/;

export const onRequest = defineMiddleware((context, next) => {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return next();
  }

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

  return next();
});
