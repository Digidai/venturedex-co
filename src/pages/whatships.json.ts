export const prerender = true;

import type { APIRoute } from "astro";
import { whatShipsSnapshot } from "../lib/whatships";

export const GET: APIRoute = () => new Response(JSON.stringify(whatShipsSnapshot), {
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400",
  },
});
