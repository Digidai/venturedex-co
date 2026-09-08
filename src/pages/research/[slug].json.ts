export const prerender = true;
import type { APIRoute } from "astro";
import { getResearchBriefs, researchBriefResource } from "../../lib/research-briefs";
export function getStaticPaths() {
  return getResearchBriefs().map((brief) => ({ params: { slug: brief.slug } }));
}
export const GET: APIRoute = ({ params }) => {
  const brief = getResearchBriefs().find((item) => item.slug === params.slug);
  if (!brief) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(researchBriefResource(brief), null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Link": `<https://venturedex.co/research/${brief.slug}>; rel="canonical"` },
  });
};
