export const prerender = false;

import type { APIRoute } from "astro";
import { getSubscriptionByToken, unsubscribeByToken } from "../../../lib/newsletter";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function html(body: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe from VentureDex</title></head><body style="margin:0;background:#FAFAF9;color:#1A1A1A;font-family:Arial,sans-serif;"><main style="max-width:520px;margin:64px auto;padding:0 24px;"><a href="/" style="font-family:Georgia,serif;font-weight:700;font-size:22px;color:#1A1A1A;text-decoration:none;">VentureDex</a>${body}</main></body></html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function tokenFromRequest(request: Request) {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  if (queryToken) return queryToken;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = asRecord(await request.json().catch(() => ({})));
    return typeof body.token === "string" ? body.token : "";
  }

  const formData = await request.formData().catch(() => null);
  return formData?.get("token")?.toString() ?? "";
}

export const GET: APIRoute = async ({ request, locals }) => {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const subscription = token ? await getSubscriptionByToken(locals.runtime.env.DB, token) : null;

  if (!subscription) {
    return html(`
      <h1 style="font-family:Georgia,serif;font-size:30px;margin:32px 0 12px;">Unsubscribe link not found.</h1>
      <p style="line-height:1.6;color:#737373;">The link may be incomplete or already invalid.</p>
    `, 404);
  }

  return html(`
    <h1 style="font-family:Georgia,serif;font-size:30px;margin:32px 0 12px;">Unsubscribe ${escapeHtml(maskEmail(subscription.email))}?</h1>
    <p style="line-height:1.6;color:#737373;">This removes the address from VentureDex Daily additions and Weekly research.</p>
    <form method="POST" action="/api/newsletter/unsubscribe" style="margin-top:24px;">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <button type="submit" style="border:0;border-radius:6px;background:#1A1A1A;color:#FAFAF9;padding:12px 16px;font-weight:700;cursor:pointer;">Unsubscribe</button>
    </form>
  `);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const token = await tokenFromRequest(request);
  const subscription = await unsubscribeByToken(locals.runtime.env.DB, token);
  const acceptsHtml = request.headers.get("accept")?.includes("text/html");

  if (!subscription) {
    return acceptsHtml
      ? html(`<h1 style="font-family:Georgia,serif;font-size:30px;margin:32px 0 12px;">Unsubscribe link not found.</h1>`, 404)
      : json({ error: "Unsubscribe link not found." }, 404);
  }

  return acceptsHtml
    ? html(`
      <h1 style="font-family:Georgia,serif;font-size:30px;margin:32px 0 12px;">You are unsubscribed.</h1>
      <p style="line-height:1.6;color:#737373;">${escapeHtml(maskEmail(subscription.email))} will no longer receive VentureDex newsletters.</p>
    `)
    : json({ ok: true });
};

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "this address";
  return `${local.slice(0, 2)}***@${domain}`;
}
