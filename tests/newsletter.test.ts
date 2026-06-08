import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCloudflareEmailMessage,
  buildConfirmationEmailMessage,
  buildWelcomeEmailMessage,
  buildDailyDigestContent,
  buildWeeklyDigestContent,
  normalizeEmail,
  parseNewsletterPreferences,
  parseNewsletterPreferencesFromForm,
  renderNewsletterPreview,
  validateCloudflareEmailMessage,
} from "../src/lib/newsletter";
import type { Startup, StartupResearch } from "../src/lib/types";
import type { WeeklyIssueContent } from "../src/lib/weekly";

const startup: Startup = {
  id: "startup-example",
  slug: "example-ai",
  domain: "example.ai",
  canonical_url: "https://example.ai",
  product_name: "Example AI",
  title: null,
  summary: "Agent workspace for regulated operators.",
  long_description: null,
  editor_note: "Example AI turns compliance review into a daily operating workflow instead of a quarterly scramble.",
  research_json: null,
  editor_rating: 4,
  why_featured: "Compliance workflow wedge",
  curator: "dai",
  product_type: "SaaS",
  funding_stage: "Seed",
  funding_display: "$4M",
  founded_year: null,
  team_size: null,
  hq_location: null,
  region: "US",
  framework: null,
  runtime_status: "live",
  workflow_status: "published",
  codex_stage: "manual",
  screenshot_r2_key: "example-ai.webp",
  screenshot_status: "ready",
  og_image_r2_key: null,
  founder_name: null,
  founder_quote: null,
  founder_responded_at: null,
  first_seen_at: "2026-05-27 10:00:00",
  last_checked_at: null,
  published_at: "2026-05-27 10:00:00",
  investors: "Useful Ventures",
  links_json: null,
  tags: "compliance,workflow",
  is_featured: 1,
  created_at: "2026-05-27 10:00:00",
  updated_at: "2026-05-27 10:00:00",
};

const research: StartupResearch = {
  verified_at: "2026-05-27",
  sources: [{ id: "official", label: "Official site", url: "https://example.ai", type: "official" }],
  product_evidence: [
    {
      claim: "The product exposes review queues, policy evidence, and approvals in one workspace.",
      source_ids: ["official"],
    },
  ],
  market_context: {
    primary_user: "Compliance teams at regulated operators.",
    category: "Workflow automation",
    differentiation: "The product keeps policy evidence and approvals in the same operating surface.",
    why_now: "Regulated teams need operational evidence before audits.",
  },
  risks: [
    {
      claim: "The open question is whether a workflow wedge expands beyond early compliance teams.",
      basis: "Editorial assessment.",
    },
  ],
};

test("normalizes valid emails and rejects malformed addresses", () => {
  assert.equal(normalizeEmail("  PERSON@Example.COM "), "person@example.com");
  assert.equal(normalizeEmail("missing-at"), null);
  assert.equal(normalizeEmail("a@b"), null);
});

test("defaults newsletter preferences to both products when input is empty or all false", () => {
  assert.deepEqual(parseNewsletterPreferences({}), { daily: true, weekly: true });
  assert.deepEqual(parseNewsletterPreferences({ daily: false, weekly: false }), { daily: true, weekly: true });
  assert.throws(
    () => parseNewsletterPreferences({ daily: false, weekly: false }, { rejectEmptySelection: true }),
    /Choose at least one newsletter/
  );
  assert.deepEqual(parseNewsletterPreferences({ daily: "on", weekly: "off" }), { daily: true, weekly: false });
});

test("form preferences require at least one explicit newsletter choice", () => {
  const defaultForm = new FormData();
  assert.deepEqual(parseNewsletterPreferencesFromForm(defaultForm), { daily: true, weekly: true });

  const weeklyOnlyForm = new FormData();
  weeklyOnlyForm.set("newsletter_preferences", "1");
  weeklyOnlyForm.set("weekly", "on");
  assert.deepEqual(parseNewsletterPreferencesFromForm(weeklyOnlyForm), { daily: false, weekly: true });

  const emptyChoiceForm = new FormData();
  emptyChoiceForm.set("newsletter_preferences", "1");
  assert.throws(() => parseNewsletterPreferencesFromForm(emptyChoiceForm), /Choose at least one newsletter/);
});

test("renders daily digest with site detail content and VentureDex visual language", () => {
  const digest = buildDailyDigestContent({
    siteUrl: "https://venturedex.co",
    periodStart: "2026-05-27 00:00:00",
    periodEnd: "2026-05-27 12:00:00",
    items: [
      {
        startup,
        funding: {
          id: "f-1",
          company_name: "Example AI",
          company_slug: "example-ai",
          company_url: "https://example.ai",
          amount: "$4M",
          stage: "Seed",
          lead_investor: "Useful Ventures",
          date: "2026-05-26",
          source_url: "https://example.com/funding",
          source_name: "Example News",
        },
        research,
      },
    ],
  });

  const rendered = renderNewsletterPreview(digest, {
    unsubscribeUrl: "https://venturedex.co/api/newsletter/unsubscribe?token=test",
    mailingAddress: "VentureDex, 123 Startup St, San Francisco, CA",
  });

  assert.equal(digest.subject, "VentureDex Daily: Example AI");
  assert.match(rendered.html, /background:#FAFAF9/);
  assert.match(rendered.html, /font-family:Georgia/);
  assert.match(rendered.html, /Example AI/);
  assert.match(rendered.html, /https:\/\/venturedex\.co\/screenshots\/example-ai\.webp/);
  assert.match(rendered.html, /Example AI website screenshot/);
  assert.match(rendered.html, /@media screen and \(max-width: 520px\)/);
  assert.match(rendered.html, /class="vd-image"/);
  assert.match(rendered.html, /width="580"/);
  assert.doesNotMatch(rendered.html, /width="600"/);
  assert.match(rendered.html, /\.vd-image \{[^}]*width: 100% !important;[^}]*max-width: 100% !important;[^}]*height: auto !important;/);
  assert.match(rendered.html, /Product evaluation/);
  assert.match(rendered.html, /Evidence used/);
  assert.match(rendered.html, /Market context/);
  assert.match(rendered.html, /Limits and risks/);
  assert.match(rendered.html, /Official site/);
  assert.match(rendered.html, /Read profile/);
  assert.match(rendered.html, /Unsubscribe/);
  assert.match(rendered.html, /class="vd-card" role="presentation"/);
  assert.match(rendered.html, /class="vd-card-cell"/);
  assert.match(rendered.html, /table-layout:fixed/);
  assert.match(rendered.html, /background:#FFFEFC/);
  assert.match(rendered.html, /padding-top:22px;border-top:1px solid #E7E1D8/);
  assert.doesNotMatch(rendered.html, /<article/);
  assert.doesNotMatch(rendered.html, /border-left/);
  assert.match(rendered.text, /Example AI/);
  assert.match(rendered.text, /Product evaluation/);
  assert.match(rendered.text, /Evidence used/);
  assert.match(rendered.text, /Market context/);
  assert.match(rendered.text, /Limits and risks/);
  assert.match(rendered.text, /https:\/\/venturedex\.co\/startups\/example-ai/);
});

test("separates adjacent daily cards with an explicit email spacer", () => {
  const secondStartup: Startup = {
    ...startup,
    id: "startup-second",
    slug: "second-ai",
    domain: "second.ai",
    canonical_url: "https://second.ai",
    product_name: "Second AI",
    summary: "AI operations layer for finance teams.",
    editor_note: "Second AI turns a messy approval queue into a visible daily control surface.",
    funding_stage: "Series A",
    funding_display: "$12M",
    screenshot_r2_key: "second-ai.webp",
  };

  const digest = buildDailyDigestContent({
    siteUrl: "https://venturedex.co",
    periodStart: "2026-05-27 00:00:00",
    periodEnd: "2026-05-27 12:00:00",
    items: [
      { startup, funding: null, research },
      { startup: secondStartup, funding: null, research },
    ],
  });

  const rendered = renderNewsletterPreview(digest, {
    unsubscribeUrl: "https://venturedex.co/api/newsletter/unsubscribe?token=test",
  });

  assert.match(
    rendered.html,
    /Read profile[\s\S]*height:30px;line-height:30px;font-size:30px;mso-line-height-rule:exactly;[\s\S]*#2 SaaS \/ Series A \/ US/
  );
});

test("builds Cloudflare Email Service message with per-recipient unsubscribe headers", () => {
  const digest = buildDailyDigestContent({
    siteUrl: "https://venturedex.co",
    periodStart: "2026-05-27 00:00:00",
    periodEnd: "2026-05-27 12:00:00",
    items: [{ startup, funding: null, research }],
  });

  const message = buildCloudflareEmailMessage({
    digest,
    siteUrl: "https://venturedex.co",
    from: { email: "newsletter@venturedex.co", name: "VentureDex" },
    mailingAddress: "VentureDex, 123 Startup St, San Francisco, CA",
    subscription: {
      id: "sub-1",
      email: "reader@example.com",
      status: "confirmed",
      preferences_json: JSON.stringify({ daily: true, weekly: true }),
      unsubscribe_token: "token-123",
      created_at: null,
      confirmed_at: null,
      unsubscribed_at: null,
      updated_at: null,
    },
  });

  validateCloudflareEmailMessage(message);
  assert.equal(message.to, "reader@example.com");
  assert.deepEqual(message.from, { email: "newsletter@venturedex.co", name: "VentureDex" });
  assert.equal(message.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(message.headers["List-Unsubscribe"], /^<https:\/\/venturedex\.co\/api\/newsletter\/unsubscribe\?token=token-123>$/);
  assert.match(message.html, /https:\/\/venturedex\.co\/unsubscribe\?token=token-123/);
  assert.equal(message.headers.Precedence, "bulk");
});

test("renders weekly digest from issue copy and pick evaluation", () => {
  const secondStartup: Startup = {
    ...startup,
    id: "startup-weekly-second",
    slug: "second-ai",
    domain: "second.ai",
    canonical_url: "https://second.ai",
    product_name: "Second AI",
    summary: "AI operations layer for finance teams.",
    editor_note: "Second AI turns a messy approval queue into a visible daily control surface.",
    funding_stage: "Series A",
    funding_display: "$12M",
    screenshot_r2_key: "second-ai.webp",
  };
  const issue: WeeklyIssueContent = {
    issue_number: 12,
    title: "Workflow wedges worth tracking",
    week_start: "2026-05-18",
    week_end: "2026-05-24",
    published_at: "2026-05-25",
    status: "published",
    editorial_intro: "This week favors narrow products with specific workflow pull.",
    research_summary: "Evidence comes from VentureDex records and official sources.",
    evaluation_method: ["Use published records only."],
    themes: [{ title: "Workflow compression", summary: "The best products remove adjacent work." }],
    picks: [
      {
        slug: "example-ai",
        why_this_week: "The product has a focused operating wedge.",
        product_evaluation: "The visible workflow is specific and source-bound.",
        evidence: [{ label: "VentureDex record", source: "content/startups/example-ai.json" }],
        risks: ["Adoption evidence is not public."],
        verdict: "Specific product-shape pick.",
      },
      {
        slug: "second-ai",
        why_this_week: "The second product proves weekly pick spacing across adjacent cards.",
        product_evaluation: "The visible workflow stays specific enough for the weekly card template.",
        evidence: [{ label: "VentureDex record", source: "content/startups/second-ai.json" }],
        risks: ["Adoption evidence remains early."],
        verdict: "Second product-shape pick.",
      },
    ],
  };

  const digest = buildWeeklyDigestContent({
    issue,
    startups: new Map([
      ["example-ai", startup],
      ["second-ai", secondStartup],
    ]),
    siteUrl: "https://venturedex.co",
  });

  const rendered = renderNewsletterPreview(digest, {
    unsubscribeUrl: "https://venturedex.co/api/newsletter/unsubscribe?token=test",
    mailingAddress: "VentureDex, 123 Startup St, San Francisco, CA",
  });

  assert.equal(digest.sendKey, "weekly:12");
  assert.match(rendered.html, /Weekly research/);
  assert.match(rendered.html, /Workflow wedges worth tracking/);
  assert.match(rendered.html, /https:\/\/venturedex\.co\/screenshots\/example-ai\.webp/);
  assert.match(rendered.html, /Example AI website screenshot/);
  assert.match(rendered.html, /Product evaluation/);
  assert.match(rendered.html, /Evidence used/);
  assert.match(rendered.html, /Limits and risks/);
  assert.match(rendered.html, /class="vd-card" role="presentation"/);
  assert.match(rendered.html, /class="vd-card-cell"/);
  assert.match(rendered.html, /table-layout:fixed/);
  assert.match(rendered.html, /background:#FFFEFC/);
  assert.match(
    rendered.html,
    /Specific product-shape pick\.[\s\S]*height:30px;line-height:30px;font-size:30px;mso-line-height-rule:exactly;[\s\S]*#2 SaaS \/ Series A \/ US/
  );
  assert.doesNotMatch(rendered.html, /<article/);
  assert.doesNotMatch(rendered.html, /border-left/);
  assert.match(rendered.text, /Full issue: https:\/\/venturedex\.co\/weekly\/12/);
  assert.match(rendered.text, /Adoption evidence is not public/);
});

test("confirmation email carries the double opt-in confirm link", () => {
  const message = buildConfirmationEmailMessage({
    email: "reader@example.com",
    token: "tok-abc",
    siteUrl: "https://venturedex.co",
    from: { email: "newsletter@venturedex.co", name: "VentureDex" },
    mailingAddress: "400 Concar Dr, San Mateo, CA 94402",
  });

  assert.equal(message.to, "reader@example.com");
  assert.equal(message.subject, "Confirm your VentureDex subscription");
  assert.match(message.html, /https:\/\/venturedex\.co\/api\/newsletter\/confirm\?token=tok-abc/);
  assert.match(message.text, /https:\/\/venturedex\.co\/api\/newsletter\/confirm\?token=tok-abc/);
  assert.match(message.html, /400 Concar Dr/);
  assert.equal(message.headers["List-Unsubscribe"], undefined);
});

test("welcome email includes one-click unsubscribe headers", () => {
  const message = buildWelcomeEmailMessage({
    email: "reader@example.com",
    token: "tok-xyz",
    siteUrl: "https://venturedex.co",
    from: { email: "newsletter@venturedex.co", name: "VentureDex" },
    mailingAddress: "400 Concar Dr, San Mateo, CA 94402",
  });

  assert.equal(message.subject, "Welcome to VentureDex");
  assert.match(
    message.headers["List-Unsubscribe"],
    /^<https:\/\/venturedex\.co\/api\/newsletter\/unsubscribe\?token=tok-xyz>$/
  );
  assert.equal(message.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(message.html, /unsubscribe\?token=tok-xyz/);
});
