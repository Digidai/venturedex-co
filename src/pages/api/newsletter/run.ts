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

async function authorized(request: Request, token?: string): Promise<boolean> {
  if (!token) return false;
  const auth = request.headers.get("authorization") ?? "";
  return safeEqual(auth, `Bearer ${token}`);
}

// Constant-time comparison via fixed-length SHA-256 digests. The Workers runtime
// exposes crypto.subtle but not Node's crypto.timingSafeEqual; hashing both sides
// to 32 bytes first makes the byte-wise compare length-independent.
async function safeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let index = 0; index < va.length; index += 1) {
    diff |= va[index] ^ vb[index];
  }
  return diff === 0;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (!(await authorized(request, env.NEWSLETTER_ADMIN_TOKEN))) {
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
