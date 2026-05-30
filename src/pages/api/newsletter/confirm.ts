export const prerender = false;

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { confirmSubscription, getSubscriptionByToken, sendWelcomeEmail } from "../../../lib/newsletter";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function html(body: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Confirm your VentureDex subscription</title></head><body style="margin:0;background:#FAFAF9;color:#1A1A1A;font-family:Arial,sans-serif;"><main style="max-width:520px;margin:64px auto;padding:0 24px;"><a href="/" style="font-family:Georgia,serif;font-weight:700;font-size:22px;color:#1A1A1A;text-decoration:none;">VentureDex</a>${body}</main></body></html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

async function tokenFromRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = asRecord(await request.json().catch(() => ({})));
    return typeof body.token === "string" ? body.token : "";
  }

  const formData = await request.formData().catch(() => null);
  return formData?.get("token")?.toString() ?? "";
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "this address";
  return `${local.slice(0, 2)}***@${domain}`;
}

const expiredBody = `
  <h1 style="font-family:Georgia,serif;font-size:30px;margin:32px 0 12px;">This confirmation link has expired.</h1>
  <p style="line-height:1.6;color:#737373;">Confirmation links are valid for 48 hours. Please subscribe again to receive a fresh link.</p>
  <p style="margin-top:24px;"><a href="/subscribe?error=expired" style="color:#2563EB;font-weight:700;">Subscribe again &rarr;</a></p>
`;

const notFoundBody = `
  <h1 style="font-family:Georgia,serif;font-size:30px;margin:32px 0 12px;">Confirmation link not found.</h1>
  <p style="line-height:1.6;color:#737373;">The link may be incomplete or already invalid.</p>
  <p style="margin-top:24px;"><a href="/subscribe?error=confirm" style="color:#2563EB;font-weight:700;">Subscribe again &rarr;</a></p>
`;

// GET renders an interstitial with a POST form. This prevents email scanners and
// link-prefetchers (which issue GET requests) from silently confirming the
// subscription — the actual opt-in only happens on the POST below.
export const GET: APIRoute = async ({ request }) => {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const subscription = token ? await getSubscriptionByToken(env.DB, token) : null;

  if (!subscription) {
    return html(notFoundBody, 404);
  }

  if (subscription.status === "unsubscribed") {
    return redirect("/subscribe?error=unsubscribed");
  }

  // Already confirmed: nothing to do, send them to the success state.
  if (subscription.status === "confirmed") {
    return redirect("/subscribe?confirmed=1");
  }

  return html(`
    <h1 style="font-family:Georgia,serif;font-size:30px;margin:32px 0 12px;">Confirm your subscription</h1>
    <p style="line-height:1.6;color:#737373;">Confirm ${escapeHtml(maskEmail(subscription.email))} to start receiving VentureDex startup picks and weekly research.</p>
    <form method="POST" action="/api/newsletter/confirm" style="margin-top:24px;">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <button type="submit" style="border:0;border-radius:6px;background:#1A1A1A;color:#FAFAF9;padding:12px 16px;font-weight:700;cursor:pointer;">Confirm subscription</button>
    </form>
  `);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const token = await tokenFromRequest(request);
  const result = token ? await confirmSubscription(env.DB, token) : null;

  if (!result) {
    return redirect("/subscribe?error=confirm");
  }
  if (result.subscription.status === "unsubscribed") {
    return redirect("/subscribe?error=unsubscribed");
  }
  if (result.expired) {
    return redirect("/subscribe?error=expired");
  }
  if (result.newlyConfirmed) {
    locals.cfContext.waitUntil(sendWelcomeEmail(env, result.subscription));
  }
  return redirect("/subscribe?confirmed=1");
};
