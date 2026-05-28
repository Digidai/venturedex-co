export const prerender = false;

import type { APIRoute } from "astro";
import { confirmSubscription, sendWelcomeEmail } from "../../../lib/newsletter";

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

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const result = token ? await confirmSubscription(env.DB, token) : null;

  if (!result) {
    return redirect("/subscribe?error=confirm");
  }
  if (result.subscription.status === "unsubscribed") {
    return redirect("/subscribe?error=unsubscribed");
  }
  if (result.newlyConfirmed) {
    locals.runtime.ctx.waitUntil(sendWelcomeEmail(env, result.subscription));
  }
  return redirect("/subscribe?confirmed=1");
};
