export const prerender = false;

import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.runtime.env.DB;

  let email: string;
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    email = body.email;
  } else {
    const formData = await request.formData();
    email = formData.get("email") as string;
  }

  if (!email || !email.includes("@") || email.length > 320) {
    if (contentType.includes("form")) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/subscribe?error=invalid" },
      });
    }

    return new Response(JSON.stringify({ error: "Valid email required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const normalized = email.toLowerCase().trim();
  const id = crypto.randomUUID();

  try {
    await db
      .prepare(
        `INSERT INTO newsletter_subscriptions (id, email, status, source)
         VALUES (?, ?, 'confirmed', 'website')
         ON CONFLICT(email) DO NOTHING`
      )
      .bind(id, normalized)
      .run();
  } catch (error) {
    console.error("Failed to subscribe email", error);
    if (contentType.includes("form")) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/subscribe?error=failed" },
      });
    }

    return new Response(JSON.stringify({ error: "Something went wrong." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // For form submissions, redirect to a thank-you state
  if (contentType.includes("form")) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/subscribe?status=subscribed" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
