import { createExports as createAstroExports } from "@astrojs/cloudflare/entrypoints/server.js";
import type { ExecutionContext, MessageBatch, ScheduledController } from "@cloudflare/workers-types";
import type { SSRManifest } from "astro";
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

export function createExports(manifest: SSRManifest) {
  const astroExports = createAstroExports(manifest);
  const astroFetch = astroExports.default.fetch as unknown as (
    request: Request,
    env: NewsletterEnv,
    ctx: ExecutionContext
  ) => Promise<Response>;

  return {
    default: {
      ...astroExports.default,
      async fetch(request: Request, env: NewsletterEnv, ctx: ExecutionContext) {
        const oneClickResponse = await handleOneClickUnsubscribe(request, env);
        if (oneClickResponse) return oneClickResponse;
        return astroFetch(request, env, ctx);
      },
      async scheduled(controller: ScheduledController, env: NewsletterEnv, ctx: ExecutionContext) {
        const type = typeForCron(controller.cron);
        if (!type) return;
        ctx.waitUntil(runNewsletterCycle(env, { type }));
      },
      async queue(batch: MessageBatch<NewsletterQueueMessage>, env: NewsletterEnv) {
        await processNewsletterDeliveryQueue(env, batch);
      },
    },
  };
}
