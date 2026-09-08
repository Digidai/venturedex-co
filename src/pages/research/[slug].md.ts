export const prerender = true;
import type { APIRoute } from "astro";
import { getResearchBriefs, researchBriefMarkdown } from "../../lib/research-briefs";
export function getStaticPaths() {
  return getResearchBriefs().map((brief) => ({ params: { slug: brief.slug } }));
}
export const GET: APIRoute = ({ params }) => {
  const brief = getResearchBriefs().find((item) => item.slug === params.slug);
  if (!brief) return new Response("Not found", { status: 404 });
  return new Response(researchBriefMarkdown(brief), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Link": `<https://venturedex.co/research/${brief.slug}>; rel="canonical"` },
  });
};
