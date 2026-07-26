export const prerender = false;

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  normalizeEmail,
  parseNewsletterPreferences,
  parseNewsletterPreferencesFromForm,
  sendConfirmationEmail,
  subscribeToNewsletter,
  type NewsletterPreferences,
} from "../../lib/newsletter";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function redirect(location: string, status = 303) {
  return new Response(null, {
    status,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

// Fixed-window rate limit backed by the rate_limits D1 table. Returns false when
// the bucket is over `limit` within `windowSeconds`; resets when the window
// expires. Conditional updates make the limit decision atomic under concurrent
// requests instead of using an unguarded SELECT followed by increment.
async function rateLimitOk(
  db: D1Database,
  bucket: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const row = await db
    .prepare("SELECT count, window_start FROM rate_limits WHERE bucket = ?")
    .bind(bucket)
    .first<{ count: number; window_start: string }>();
  if (row) {
    const started = Date.parse(row.window_start.replace(" ", "T") + "Z");
    if (Number.isFinite(started) && Date.now() - started < windowSeconds * 1000) {
      const result = await db
        .prepare(
          `UPDATE rate_limits
           SET count = count + 1
           WHERE bucket = ? AND window_start = ? AND count < ?`
        )
        .bind(bucket, row.window_start, limit)
        .run();
      return result.meta.changes > 0;
    }
    const result = await db
      .prepare(
        `UPDATE rate_limits
         SET count = 1, window_start = datetime('now')
         WHERE bucket = ? AND window_start = ?`
      )
      .bind(bucket, row.window_start)
      .run();
    return result.meta.changes > 0;
  }
  const result = await db
    .prepare(
      `INSERT INTO rate_limits (bucket, count, window_start)
       VALUES (?, 1, datetime('now'))
       ON CONFLICT(bucket) DO NOTHING`
    )
    .bind(bucket)
    .run();
  return result.meta.changes > 0;
}

function genericAcceptedResponse(isJson: boolean) {
  return isJson
    ? json({ ok: true, status: "pending" })
    : redirect("/subscribe?pending=1", 302);
}

export const POST: APIRoute = async ({ request, locals }) => {
  const db = env.DB;

  let email: string | null;
  let preferences: NewsletterPreferences;
  let proofToken: string | undefined;
  let source = "website";
  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!hasSameOrigin(request)) {
    return isJson ? json({ error: "Invalid request origin." }, 403) : redirect("/subscribe?error=server");
  }

  if (isJson) {
    const body = asRecord(await request.json().catch(() => ({})));
    if (typeof body.company === "string" && body.company.trim()) {
      return json({ ok: true });
    }
    email = normalizeEmail(body.email);
    proofToken = typeof body.token === "string" ? body.token : undefined;
    source = typeof body.source === "string" ? body.source : "api";
    try {
      preferences = parseNewsletterPreferences(body.preferences, { rejectEmptySelection: true });
    } catch (error) {
      return json({ error: "Choose at least one newsletter." }, 400);
    }
  } else {
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return redirect("/subscribe?error=server");
    }
    if (formData.get("company")?.toString().trim()) {
      return redirect("/subscribe?subscribed=1", 302);
    }
    email = normalizeEmail(formData.get("email"));
    proofToken = formData.get("token")?.toString();
    source = formData.get("source")?.toString() ?? "website";
    try {
      preferences = parseNewsletterPreferencesFromForm(formData);
    } catch (error) {
      return redirect("/subscribe?error=preferences");
    }
  }

  if (!email) {
    if (!isJson) {
      return redirect("/subscribe?error=email");
    }
    return json({ error: "Valid email required." }, 400);
  }

  // Throttle before any subscription write so rejected traffic cannot grow the
  // table or change state. Infrastructure failures fail closed, while the
  // external response remains indistinguishable from an accepted request.
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  let mayProcess = false;
  try {
    mayProcess =
      (await rateLimitOk(db, `confirm-ip:${ip}`, 8, 3600))
      && (await rateLimitOk(db, `confirm-email:${email}`, 1, 600));
  } catch {
    mayProcess = false;
  }
  if (!mayProcess) {
    return genericAcceptedResponse(isJson);
  }

  let subscription: Awaited<ReturnType<typeof subscribeToNewsletter>>;
  try {
    subscription = await subscribeToNewsletter(db, {
      email,
      preferences,
      source,
      proofToken,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    if (!isJson) {
      const errorCode = message === "Choose at least one newsletter." ? "preferences" : "server";
      return redirect(`/subscribe?error=${errorCode}`);
    }
    return json(
      { error: "Something went wrong." },
      message === "Valid email required." || message === "Choose at least one newsletter." ? 400 : 500
    );
  }

  // New, pending, and re-subscribed addresses prove mailbox possession through
  // the existing double-opt-in link. Confirmed addresses are never mutated
  // unless `proofToken` matches the token previously delivered to that inbox.
  // The task runs after the response so timing and response bodies do not reveal
  // whether the address was already confirmed.
  if (subscription.status === "pending") {
    locals.cfContext.waitUntil(
      sendConfirmationEmail(env, subscription).then((confirmation) => {
        if (!confirmation.ok) {
          console.error("Newsletter confirmation email could not be sent.");
        }
      })
    );
  }

  return genericAcceptedResponse(isJson);
};
