export const prerender = false;

import type { APIRoute } from "astro";

export const GET: APIRoute = ({ params }) =>
  new Response(null, {
    status: 301,
    headers: {
      Location: `/startups/${params.slug ?? ""}`,
    },
  });
