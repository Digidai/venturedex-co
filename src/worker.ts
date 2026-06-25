// Custom Cloudflare Worker entrypoint (adapter v13). `handle()` runs Astro's
// request handling (assets + SSR routes); we wrap it to add the RFC 8058
// one-click unsubscribe, the daily/weekly newsletter cron, and the delivery
// queue consumer. `createExports(manifest)` was removed in v13 — the entry is now
// a plain ExportedHandler. wrangler `main` must point at this file's build output.
import { handle } from "@astrojs/cloudflare/handler";
import type { ExecutionContext, MessageBatch, ScheduledController } from "@cloudflare/workers-types";
import { canonicalRedirectUrl, withHttpPolicy, withSecurityHeaders } from "./lib/http-policy";
import {
  processNewsletterDeliveryQueue,
  runNewsletterCycle,
  unsubscribeByToken,
  type NewsletterEnv,
  type NewsletterQueueMessage,
  type NewsletterType,
} from "./lib/newsletter";

const DAILY_CRON = "30 13 * * *";
const WEEKLY_CRON = "0 14 * * 2";

function htmlCanonicalRedirect(request: Request): Response | null {
  const target = canonicalRedirectUrl(request.url, request.method);
  return target ? withSecurityHeaders(Response.redirect(target, 301)) : null;
}

// Single-line JSON logs so Cloudflare Workers Logs / Logpush can parse and alert
// on newsletter cron + queue outcomes (previously these ran silently).
function logEvent(event: string, data: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...data }));
  } catch {
    console.log(`${event} (unserializable payload)`);
  }
}

function typeForCron(cron: string): NewsletterType | null {
  if (cron === DAILY_CRON) return "daily";
  if (cron === WEEKLY_CRON) return "weekly";
  return null;
}

async function handleOneClickUnsubscribe(request: Request, env: NewsletterEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== "/api/newsletter/unsubscribe") {
    return null;
  }
  const token = url.searchParams.get("token") ?? "";
  if (!token || !(await isOneClickUnsubscribePost(request))) {
    return null;
  }

  const subscription = await unsubscribeByToken(env.DB, token);
  return new Response(null, {
    status: subscription ? 204 : 404,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

async function isOneClickUnsubscribePost(request: Request): Promise<boolean> {
  const header = request.headers.get("list-unsubscribe") ?? "";
  if (header === "One-Click" || header === "List-Unsubscribe=One-Click") return true;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("text/plain")) {
    return false;
  }

  const body = await request.clone().text();
  return body.split("&").some((part) => {
    try {
      return decodeURIComponent(part.replace(/\+/g, " ")) === "List-Unsubscribe=One-Click";
    } catch {
      return part === "List-Unsubscribe=One-Click";
    }
  });
}

// env arrives as the Cloudflare bindings object (global `Env`); the newsletter
// helpers accept the structurally-narrower NewsletterEnv.
const asNewsletterEnv = (env: Env): NewsletterEnv => env as unknown as NewsletterEnv;

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const canonicalRedirect = htmlCanonicalRedirect(request);
    if (canonicalRedirect) return canonicalRedirect;

    const oneClickResponse = await handleOneClickUnsubscribe(request, asNewsletterEnv(env));
    if (oneClickResponse) return withSecurityHeaders(oneClickResponse);
    const response = await (handle(request, env, ctx) as unknown as Promise<Response>);
    return withHttpPolicy(request, response);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const type = typeForCron(controller.cron);
    if (!type) return;
    ctx.waitUntil(
      runNewsletterCycle(asNewsletterEnv(env), { type })
        .then((result) => logEvent("newsletter_cycle", { ...result }))
        .catch((error) =>
          logEvent("newsletter_cycle_error", { type, error: error instanceof Error ? error.message : String(error) })
        )
    );
  },

  async queue(batch: MessageBatch<NewsletterQueueMessage>, env: Env): Promise<void> {
    try {
      await processNewsletterDeliveryQueue(asNewsletterEnv(env), batch);
    } catch (error) {
      logEvent("newsletter_queue_error", {
        batchSize: batch.messages.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
};

export default worker;
