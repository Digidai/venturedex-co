import {
  latestDailyDate,
  latestFunding,
  startupUrl,
  utmUrl,
  weeklyUrl,
  type PromotionStartup,
  type PromotionWeeklyIssue,
} from "./content";

export interface PromotionPackInput {
  dailyDate: string | null;
  dailyStartups: PromotionStartup[];
  weeklyIssue: PromotionWeeklyIssue | null;
  generatedAt?: Date;
}

export function buildPromotionPackMarkdown(input: PromotionPackInput): string {
  const campaign = campaignName(input);
  const reportDate = input.dailyDate ?? input.weeklyIssue?.published_at?.slice(0, 10) ?? formatDate(input.generatedAt ?? new Date());
  const lines: string[] = [];

  lines.push(`# VentureDex Promotion Pack - ${reportDate}`);
  lines.push("");
  lines.push("## Canonical URLs");
  for (const startup of input.dailyStartups) {
    lines.push(`- ${startup.product_name}: ${startupUrl(startup.slug)}`);
  }
  if (input.weeklyIssue) {
    lines.push(`- ${input.weeklyIssue.title}: ${weeklyUrl(input.weeklyIssue.issue_number)}`);
  }
  lines.push("");

  appendDailyAdditions(lines, input.dailyStartups, campaign);
  appendSocialDrafts(lines, input.dailyStartups, input.weeklyIssue, campaign);
  appendOutreachShareKit(lines, input.dailyStartups, input.weeklyIssue, campaign);
  appendWeeklyIssue(lines, input.weeklyIssue, campaign);
  appendCommunityGuardrails(lines);

  return `${lines.join("\n").trim()}\n`;
}

export function campaignName(input: PromotionPackInput): string {
  const date = input.dailyDate
    ?? latestDailyDate(input.dailyStartups)
    ?? input.weeklyIssue?.published_at?.slice(0, 10)
    ?? formatDate(input.generatedAt ?? new Date());
  return `venturedex_${date.replace(/-/g, "")}`;
}

export function oneLine(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function xDraft(value: string, maxLength = 260): string {
  const text = oneLine(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

function appendDailyAdditions(lines: string[], startups: PromotionStartup[], campaign: string): void {
  if (startups.length === 0) return;
  lines.push("## Daily Additions");
  for (const startup of startups) {
    const funding = latestFunding(startup);
    const metadata = [
      startup.product_type,
      funding?.stage,
      funding?.amount,
      funding?.lead_investor ? `lead: ${funding.lead_investor}` : null,
    ].filter(Boolean).join(" / ");
    lines.push(`### ${startup.product_name}`);
    lines.push(`- Canonical: ${startupUrl(startup.slug)}`);
    lines.push(`- LinkedIn UTM: ${utmUrl(startupUrl(startup.slug), "linkedin", "social", campaign)}`);
    lines.push(`- X UTM: ${utmUrl(startupUrl(startup.slug), "x", "social", campaign)}`);
    if (metadata) lines.push(`- Signal: ${metadata}`);
    if (startup.summary) lines.push(`- Summary: ${oneLine(startup.summary)}`);
    if (startup.why_featured) lines.push(`- Why VentureDex is watching: ${oneLine(startup.why_featured)}`);
    if (startup.investors) lines.push(`- Investors: ${startup.investors}`);
    lines.push(`- Share image: https://venturedex.co/screenshots/${startup.slug}.webp`);
    lines.push("");
  }
}

function appendSocialDrafts(
  lines: string[],
  startups: PromotionStartup[],
  weeklyIssue: PromotionWeeklyIssue | null,
  campaign: string
): void {
  if (startups.length === 0 && !weeklyIssue) return;
  const names = startups.map((startup) => startup.product_name);

  lines.push("## LinkedIn Draft");
  lines.push("");
  if (startups.length > 0) {
    lines.push(`New VentureDex research is live: ${names.join(", ")}.`);
    lines.push("");
    lines.push("Each profile includes product evidence, funding context, source trails, and the editorial reason it made the queue.");
    lines.push("");
    lines.push(`Start here: ${utmUrl(startupUrl(startups[0].slug), "linkedin", "social", campaign)}`);
  } else if (weeklyIssue) {
    lines.push(`New VentureDex Weekly research is live: ${weeklyIssue.title}.`);
    lines.push("");
    lines.push(`Read the issue: ${utmUrl(weeklyUrl(weeklyIssue.issue_number), "linkedin", "social", campaign)}`);
  }
  lines.push("");

  lines.push("## X / Threads Drafts");
  lines.push("");
  if (startups.length > 0) {
    const batchUrl = utmUrl(startupUrl(startups[0].slug), "x", "social", campaign);
    lines.push(`1. ${xDraft(`New on VentureDex: ${names.join(", ")}. Source-backed profiles with funding context, product evidence, and risk notes. ${batchUrl}`)}`);
    for (const startup of startups.slice(0, 4)) {
      lines.push(`- ${xDraft(`${startup.product_name}: ${startup.why_featured ?? startup.summary ?? "new VentureDex profile"}. ${utmUrl(startupUrl(startup.slug), "x", "social", campaign)}`)}`);
    }
  }
  if (weeklyIssue) {
    lines.push(`- ${xDraft(`VentureDex Weekly #${weeklyIssue.issue_number}: ${weeklyIssue.title}. ${utmUrl(weeklyUrl(weeklyIssue.issue_number), "x", "social", campaign)}`)}`);
  }
  lines.push("");
}

function appendOutreachShareKit(
  lines: string[],
  startups: PromotionStartup[],
  weeklyIssue: PromotionWeeklyIssue | null,
  campaign: string
): void {
  if (startups.length === 0 && !weeklyIssue) return;

  lines.push("## Founder / Team Share Kit");
  lines.push("");
  for (const startup of startups) {
    lines.push(`### ${startup.product_name}`);
    lines.push(`- Share copy: VentureDex published a source-backed profile of ${startup.product_name}: ${startupUrl(startup.slug)}.`);
    lines.push(`- Correction path: reply with the official URL, product wording, or source that should be corrected; VentureDex will keep the source trail explicit.`);
    lines.push(`- Suggested repost link: ${utmUrl(startupUrl(startup.slug), "founder", "outreach", campaign)}`);
    lines.push("");
  }

  lines.push("## Investor Share Kit");
  lines.push("");
  for (const startup of startups.filter((startup) => startup.investors)) {
    lines.push(`- ${startup.product_name}: portfolio/context mention for ${startup.investors}. Link: ${utmUrl(startupUrl(startup.slug), "investor", "outreach", campaign)}`);
  }
  if (!startups.some((startup) => startup.investors)) {
    lines.push("- No investor-specific outreach targets in this batch.");
  }
  lines.push("");
}

function appendWeeklyIssue(lines: string[], weeklyIssue: PromotionWeeklyIssue | null, campaign: string): void {
  if (!weeklyIssue) return;
  lines.push("## Weekly Issue Share Kit");
  lines.push("");
  lines.push(`${weeklyIssue.title}`);
  lines.push("");
  if (weeklyIssue.research_summary) lines.push(oneLine(weeklyIssue.research_summary));
  else if (weeklyIssue.editorial_intro) lines.push(oneLine(weeklyIssue.editorial_intro));
  lines.push("");
  lines.push(`- Canonical: ${weeklyUrl(weeklyIssue.issue_number)}`);
  lines.push(`- LinkedIn UTM: ${utmUrl(weeklyUrl(weeklyIssue.issue_number), "linkedin", "social", campaign)}`);
  lines.push(`- Share image: https://venturedex.co/og/weekly-${weeklyIssue.issue_number}.png`);
  lines.push("");
}

function appendCommunityGuardrails(lines: string[]): void {
  lines.push("## Community Review Queue");
  lines.push("- HN: review manually; only submit if the primary angle is technical, open source, devtools, or original research.");
  lines.push("- Reddit: review manually; avoid link drops and use community-specific context.");
  lines.push("- Founder/investor outreach: send only reviewed correction/share notes; do not ask for backlinks directly.");
  lines.push("");
  lines.push("## Community Distribution Guardrails");
  lines.push("- Submit only where the specific company or market thread is already relevant.");
  lines.push("- Disclose VentureDex affiliation where platform norms require it.");
  lines.push("- Prefer one high-context comment or post over repeated link drops.");
  lines.push("");
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
