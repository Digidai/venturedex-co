export const prerender = false;

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  parseNewsletterPreferences,
  parseNewsletterPreferencesFromForm,
  updateNewsletterPreferencesByToken,
  type NewsletterPreferences,
} from "../../../lib/newsletter";

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

function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function managementLocation(token: string, state: "saved" | "error"): string {
  const params = new URLSearchParams({ preferences: state });
  const cleanToken = token.trim();
  if (cleanToken && cleanToken.length <= 128) {
    params.set("token", cleanToken);
  }
  return `/unsubscribe?${params.toString()}`;
}

export const POST: APIRoute = async ({ request }) => {
  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  if (!hasSameOrigin(request)) {
    return isJson
      ? json({ error: "Invalid request origin." }, 403)
      : redirect("/unsubscribe?preferences=error");
  }

  let token = "";
  let preferences: NewsletterPreferences;
  if (isJson) {
    const body = asRecord(await request.json().catch(() => ({})));
    token = typeof body.token === "string" ? body.token : "";
    if (!body.preferences || typeof body.preferences !== "object") {
      return json({ error: "Choose at least one newsletter." }, 400);
    }
    try {
      preferences = parseNewsletterPreferences(
        body.preferences,
        { rejectEmptySelection: true }
      );
    } catch {
      return json({ error: "Choose at least one newsletter." }, 400);
    }
  } else {
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return redirect("/unsubscribe?preferences=error");
    }
    token = formData.get("token")?.toString() ?? "";
    try {
      preferences = parseNewsletterPreferencesFromForm(formData);
    } catch {
      return redirect(managementLocation(token, "error"));
    }
  }

  try {
    // Deliberately ignore the match result. Known, unknown, pending, and
    // unsubscribed tokens receive the same public response, while the SQL
    // update itself only permits a confirmed bearer-token match.
    await updateNewsletterPreferencesByToken(env.DB, token, preferences);
  } catch {
    return isJson
      ? json({ error: "Something went wrong." }, 500)
      : redirect(managementLocation(token, "error"));
  }

  return isJson
    ? json({ ok: true })
    : redirect(managementLocation(token, "saved"));
};
