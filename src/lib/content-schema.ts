import { z } from "astro/zod";

/**
 * Zod schemas for version-controlled content (content/startups/*.json, weekly,
 * investors, collections). These validate the raw JSON shape at build time so a
 * malformed entry fails fast with a precise message, instead of silently
 * rendering a broken card or diverging from the D1 seed.
 *
 * Deliberately permissive: only the fields the readers truly depend on are
 * required; everything else is optional and unknown keys pass through. The goal
 * is to catch genuine mistakes (missing slug, wrong type) without rejecting
 * valid content as the schema evolves. The transform itself still lives in
 * content.ts / build-db.sh; this only guards the inputs.
 */

const fundingRoundSchema = z
  .object({
    amount: z.string().optional(),
    stage: z.string().optional(),
    lead_investor: z.string().optional(),
    date: z.string().optional(),
    source_url: z.string().optional(),
    source_name: z.string().optional(),
  })
  .passthrough();

export const startupSchema = z
  .object({
    slug: z.string().min(1),
    domain: z.string().min(1),
    product_name: z.string().min(1),
    url: z.string().optional(),
    summary: z.string().optional(),
    editor_note: z.string().optional(),
    editor_rating: z.number().int().min(1).max(5).optional(),
    why_featured: z.string().optional(),
    product_type: z.string().optional(),
    region: z.string().optional(),
    tags: z.string().optional(),
    investors: z.string().optional(),
    hq_location: z.string().optional(),
    team_size: z.string().optional(),
    founded_year: z.number().int().optional(),
    is_featured: z.boolean().optional(),
    funding: z.array(fundingRoundSchema).optional(),
    research: z.record(z.unknown()).optional(),
    links: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const weeklyIssueSchema = z
  .object({
    issue_number: z.number().int(),
    title: z.string().min(1),
    status: z.enum(["draft", "published", "archived"]).optional(),
    week_start: z.string().optional(),
    week_end: z.string().optional(),
    published_at: z.string().optional(),
    editorial_intro: z.string().optional(),
    research_summary: z.string().optional(),
    picks: z.array(z.union([z.string(), z.record(z.unknown())])).optional(),
  })
  .passthrough();

export const investorEntrySchema = z
  .object({
    name: z.string().min(1),
    slug: z.string().min(1),
    short_name: z.string().optional(),
    website: z.string().optional(),
    description: z.string().optional(),
    aliases: z.array(z.string()).optional(),
  })
  .passthrough();

export const collectionConfigSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().min(1),
    title: z.string().min(1),
    description: z.string(),
    match: z
      .object({
        product_types: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type StartupContent = z.infer<typeof startupSchema>;

/** Validate a startup record; throws with a precise, file-scoped message. */
export function assertValidStartup(value: unknown, source: string): void {
  const result = startupSchema.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid startup content in ${source}: ${detail}`);
  }
}
