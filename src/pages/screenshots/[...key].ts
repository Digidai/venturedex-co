export const prerender = false;

import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ params, locals }) => {
  const key = `screenshots/${params.key}`;
  const r2 = locals.runtime.env.R2;

  const object = await r2.get(key);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/webp",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
      "ETag": object.etag,
    },
  });
};
