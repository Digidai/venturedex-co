export const prerender = false;

import type { APIRoute } from "astro";
import { runNewsletterCycle, type NewsletterType } from "../../../lib/newsletter";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseType(value: string | null): NewsletterType | null {
  return value === "daily" || value === "weekly" ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function authorized(request: Request, token?: string) {
  if (!token) return false;
  const auth = request.headers.get("authorization") ?? "";
  return timingSafeEqual(auth, `Bearer ${token}`);
}

function timingSafeEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length, 128);
  let diff = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (!authorized(request, env.NEWSLETTER_ADMIN_TOKEN)) {
    return json({ error: "Unauthorized." }, 401);
  }

  const url = new URL(request.url);
  let type = parseType(url.searchParams.get("type"));
  let dryRun = url.searchParams.get("dry_run") === "1";
  let force = url.searchParams.get("force") === "1";

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = asRecord(await request.json().catch(() => ({})));
    type = parseType(typeof body.type === "string" ? body.type : null) ?? type;
    dryRun = Boolean(body.dryRun ?? dryRun);
    force = Boolean(body.force ?? force);
  }

  if (!type) {
    return json({ error: "type must be daily or weekly." }, 400);
  }

  const result = await runNewsletterCycle(env, {
    type,
    dryRun,
    force,
  });

  return json(result, result.ok ? 200 : 500);
};
