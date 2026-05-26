export interface Startup {
  id: string;
  slug: string;
  domain: string;
  canonical_url: string | null;
  product_name: string;
  title: string | null;
  summary: string | null;
  long_description: string | null;
  editor_note: string | null;
  research_json: string | null;
  editor_rating: number | null;
  why_featured: string | null;
  curator: string;
  product_type: string | null;
  funding_stage: string | null;
  funding_display: string | null;
  founded_year: number | null;
  team_size: string | null;
  hq_location: string | null;
  region: string | null;
  framework: string | null;
  runtime_status: "live" | "redirect" | "parked" | "dead";
  workflow_status: "draft" | "published" | "archived";
  codex_stage: string;
  screenshot_r2_key: string | null;
  screenshot_status: "pending" | "ready" | "failed";
  og_image_r2_key: string | null;
  founder_name: string | null;
  founder_quote: string | null;
  founder_responded_at: string | null;
  first_seen_at: string;
  last_checked_at: string | null;
  published_at: string | null;
  investors: string | null;
  links_json: string | null;
  tags: string | null;
  is_featured: number;
  created_at: string;
  updated_at: string;
}

export interface StartupLinks {
  github?: string;
  twitter?: string;
  linkedin?: string;
  producthunt?: string;
}

export interface StartupResearchSource {
  id: string;
  label: string;
  url?: string;
  type: "official" | "funding" | "product" | "repository" | "social" | "editorial";
}

export interface StartupResearchEvidence {
  claim: string;
  source_ids: string[];
}

export interface StartupResearchRisk {
  claim: string;
  basis: string;
}

export interface StartupResearch {
  verified_at: string;
  sources: StartupResearchSource[];
  product_evidence: StartupResearchEvidence[];
  market_context?: {
    primary_user?: string;
    category?: string;
    differentiation?: string;
    why_now?: string;
  };
  risks?: StartupResearchRisk[];
}

export interface WeeklyIssue {
  id: string;
  issue_number: number;
  title: string;
  editorial_intro: string | null;
  anti_pick_name: string | null;
  anti_pick_url: string | null;
  anti_pick_reason: string | null;
  og_image_r2_key: string | null;
  published_at: string | null;
  status: "draft" | "published" | "archived";
}

export interface Collection {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  type: "auto" | "editorial";
  published: number;
}

export interface Investor {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  website: string | null;
  description: string | null;
}

export interface FundingRound {
  id: string;
  company_name: string;
  company_slug: string | null;
  company_url: string | null;
  amount: string | null;
  stage: string;
  lead_investor: string | null;
  date: string;
  source_url: string | null;
  source_name: string | null;
}

export type ProductType =
  | "AI / ML"
  | "SaaS"
  | "DevTools"
  | "Fintech"
  | "HealthTech"
  | "EdTech"
  | "E-commerce"
  | "Marketplace"
  | "Creator Tools"
  | "Climate / Sustainability"
  | "Other";

export type FundingStage =
  | "Seed"
  | "Series A"
  | "Series B"
  | "Series C";

export const PRODUCT_TYPES: ProductType[] = [
  "AI / ML", "SaaS", "DevTools", "Fintech", "HealthTech",
  "EdTech", "E-commerce", "Marketplace", "Creator Tools",
  "Climate / Sustainability", "Other",
];

export const FUNDING_STAGES: FundingStage[] = [
  "Seed", "Series A", "Series B", "Series C",
];
