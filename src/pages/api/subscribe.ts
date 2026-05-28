export const prerender = false;

import type { APIRoute } from "astro";
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
    headers: { "Content-Type": "application/json" },
  });
}

function sameOriginOrNoOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function redirect(location: string, status = 303) {
  return new Response(null, {
    status,
    headers: { Location: location },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const db = env.DB;

  let email: string | null;
  let preferences: NewsletterPreferences;
  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!sameOriginOrNoOrigin(request)) {
    return isJson ? json({ error: "Invalid request origin." }, 403) : redirect("/subscribe?error=server");
  }

  if (isJson) {
    const body = asRecord(await request.json().catch(() => ({})));
    if (typeof body.company === "string" && body.company.trim()) {
      return json({ ok: true });
    }
    email = normalizeEmail(body.email);
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

  let subscription: Awaited<ReturnType<typeof subscribeToNewsletter>>;
  try {
    subscription = await subscribeToNewsletter(db, {
      email,
      preferences,
      source: "website",
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

  // Already confirmed earlier: acknowledge without resending anything.
  if (subscription.status === "confirmed") {
    return isJson
      ? json({ ok: true, status: "confirmed" })
      : redirect("/subscribe?already=1", 302);
  }

  // Pending (new or re-subscribed): send the double opt-in confirmation email.
  const confirmation = await sendConfirmationEmail(env, subscription);
  if (!confirmation.ok) {
    return isJson
      ? json({ error: "Could not send confirmation email." }, 502)
      : redirect("/subscribe?error=server", 302);
  }

  return isJson
    ? json({ ok: true, status: "pending" })
    : redirect("/subscribe?pending=1", 302);
};
