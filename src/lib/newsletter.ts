import { getFundingRoundsForStartup, getStartupBySlug } from "./db";
import type { FundingRound, Startup, StartupResearch } from "./types";
import type { WeeklyIssueContent } from "./weekly";

export type NewsletterType = "daily" | "weekly";

export interface NewsletterPreferences {
  daily: boolean;
  weekly: boolean;
}

export interface NewsletterSubscription {
  id: string;
  email: string;
  status: "pending" | "confirmed" | "unsubscribed";
  preferences_json: string | null;
  unsubscribe_token: string | null;
  created_at: string | null;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  updated_at: string | null;
}

export interface NewsletterRunOptions {
  type: NewsletterType;
  now?: Date;
  dryRun?: boolean;
  force?: boolean;
}

export interface NewsletterQueueMessage {
  sendId: string;
  deliveryId: string;
  newsletterType: NewsletterType;
  sendKey: string;
}

export interface NewsletterEnv {
  DB: D1Database;
  EMAIL?: SendEmail;
  NEWSLETTER_DELIVERY_QUEUE?: Queue<NewsletterQueueMessage>;
  SITE_URL?: string;
  NEWSLETTER_FROM?: string;
  NEWSLETTER_REPLY_TO?: string;
  NEWSLETTER_DAILY_DELAY_HOURS?: string;
  NEWSLETTER_WEEKLY_DELAY_HOURS?: string;
  NEWSLETTER_WEEKLY_MAX_AGE_DAYS?: string;
  NEWSLETTER_BOOTSTRAP_DAILY?: string;
  NEWSLETTER_MAILING_ADDRESS?: string;
}

export interface NewsletterRunResult {
  ok: boolean;
  status: "sending" | "sent" | "skipped" | "failed" | "dry_run";
  type: NewsletterType;
  sendKey?: string;
  subject?: string;
  itemCount: number;
  recipientCount: number;
  message?: string;
  error?: string;
}

interface DigestContent {
  type: NewsletterType;
  sendKey: string;
  subject: string;
  previewText: string;
  periodStart: string | null;
  periodEnd: string | null;
  itemCount: number;
  htmlMain: string;
  textMain: string;
}

interface DailyStartupItem {
  startup: Startup;
  funding: FundingRound | null;
  research: StartupResearch | null;
}

interface ParsePreferenceOptions {
  rejectEmptySelection?: boolean;
}

const DEFAULT_PREFERENCES: NewsletterPreferences = {
  daily: true,
  weekly: true,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const QUEUE_BATCH_SIZE = 100;
const CLOUDFLARE_MAX_SUBJECT_LENGTH = 998;
const CLOUDFLARE_MAX_MESSAGE_BYTES = 5 * 1024 * 1024;
const CLOUDFLARE_MAX_HEADER_BYTES = 16 * 1024;
const CLOUDFLARE_MAX_HEADER_VALUE_BYTES = 2048;

export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > 254 || !EMAIL_RE.test(normalized)) {
    return null;
  }
  return normalized;
}

export function parseNewsletterPreferences(
  input: unknown,
  options: ParsePreferenceOptions = {}
): NewsletterPreferences {
  if (!input || typeof input !== "object") return { ...DEFAULT_PREFERENCES };
  const record = input as Record<string, unknown>;
  const daily = boolPreference(record.daily, true);
  const weekly = boolPreference(record.weekly, true);
  if (!daily && !weekly) {
    if (options.rejectEmptySelection) {
      throw new Error("Choose at least one newsletter.");
    }
    return { ...DEFAULT_PREFERENCES };
  }
  return { daily, weekly };
}

export function parseNewsletterPreferencesFromForm(formData: FormData): NewsletterPreferences {
  const hasPreferenceMarker = formData.get("newsletter_preferences") === "1";
  const hasExplicitChoice = formData.has("daily") || formData.has("weekly");
  if (!hasExplicitChoice && !hasPreferenceMarker) return { ...DEFAULT_PREFERENCES };
  const daily = formData.get("daily") === "on";
  const weekly = formData.get("weekly") === "on";
  if (!daily && !weekly) {
    throw new Error("Choose at least one newsletter.");
  }
  return { daily, weekly };
}

export async function subscribeToNewsletter(
  db: D1Database,
  input: {
    email: string;
    preferences?: NewsletterPreferences;
    source?: string;
  }
): Promise<NewsletterSubscription> {
  const email = normalizeEmail(input.email);
  if (!email) {
    throw new Error("Valid email required.");
  }

  const preferences = input.preferences ?? DEFAULT_PREFERENCES;
  const token = crypto.randomUUID();
  const id = crypto.randomUUID();
  const source = cleanSource(input.source);
  const existing = await getSubscriptionByEmail(db, email);

  if (existing?.status === "unsubscribed") {
    await db
      .prepare(
        `UPDATE newsletter_subscriptions
         SET preferences_json = ?,
             source = ?,
             updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(JSON.stringify(preferences), source, existing.id)
      .run();
    return {
      ...existing,
      preferences_json: JSON.stringify(preferences),
    };
  }

  await db
    .prepare(
      `INSERT INTO newsletter_subscriptions (
         id, email, preferences_json, status, source, unsubscribe_token, confirmed_at, updated_at
       )
       VALUES (?, ?, ?, 'confirmed', ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(email) DO UPDATE SET
         preferences_json = excluded.preferences_json,
         status = 'confirmed',
         source = excluded.source,
         unsubscribe_token = COALESCE(newsletter_subscriptions.unsubscribe_token, excluded.unsubscribe_token),
         confirmed_at = COALESCE(newsletter_subscriptions.confirmed_at, datetime('now')),
         unsubscribed_at = NULL,
         updated_at = datetime('now')`
    )
    .bind(id, email, JSON.stringify(preferences), source, token)
    .run();

  const subscription = await getSubscriptionByEmail(db, email);
  if (!subscription) {
    throw new Error("Subscription was not saved.");
  }
  return subscription;
}

export async function unsubscribeByToken(
  db: D1Database,
  token: string
): Promise<NewsletterSubscription | null> {
  const cleanToken = token.trim();
  if (!cleanToken || cleanToken.length > 128) return null;

  const subscription = await db
    .prepare("SELECT * FROM newsletter_subscriptions WHERE unsubscribe_token = ?")
    .bind(cleanToken)
    .first<NewsletterSubscription>();

  if (!subscription) return null;

  await db
    .prepare(
      `UPDATE newsletter_subscriptions
       SET status = 'unsubscribed',
           unsubscribed_at = COALESCE(unsubscribed_at, datetime('now')),
           updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(subscription.id)
    .run();

  return {
    ...subscription,
    status: "unsubscribed",
  };
}

export async function getSubscriptionByToken(
  db: D1Database,
  token: string
): Promise<NewsletterSubscription | null> {
  const cleanToken = token.trim();
  if (!cleanToken || cleanToken.length > 128) return null;
  return db
    .prepare("SELECT * FROM newsletter_subscriptions WHERE unsubscribe_token = ?")
    .bind(cleanToken)
    .first<NewsletterSubscription>();
}

export async function runNewsletterCycle(
  env: NewsletterEnv,
  options: NewsletterRunOptions
): Promise<NewsletterRunResult> {
  const now = options.now ?? new Date();
  const siteUrl = normalizeSiteUrl(env.SITE_URL);
  const digest = options.type === "daily"
    ? await buildDailyDigest(env.DB, siteUrl, now, options.force ?? false, env)
    : await buildWeeklyDigest(env.DB, siteUrl, now, options.force ?? false, env);

  if (!digest) {
    return {
      ok: true,
      status: "skipped",
      type: options.type,
      itemCount: 0,
      recipientCount: 0,
      message: "No eligible newsletter content.",
    };
  }

  const existing = await env.DB
    .prepare("SELECT * FROM newsletter_sends WHERE send_key = ?")
    .bind(digest.sendKey)
    .first<{ id: string; status: string }>();

  if (existing && existing.status === "sent" && !options.force) {
    return {
      ok: true,
      status: "skipped",
      type: options.type,
      sendKey: digest.sendKey,
      subject: digest.subject,
      itemCount: digest.itemCount,
      recipientCount: 0,
      message: "Newsletter was already sent.",
    };
  }

  if (existing && existing.status === "sending" && !options.force) {
    return {
      ok: true,
      status: "skipped",
      type: options.type,
      sendKey: digest.sendKey,
      subject: digest.subject,
      itemCount: digest.itemCount,
      recipientCount: 0,
      message: "Newsletter send is already in progress.",
    };
  }

  if (options.dryRun && digest.itemCount === 0) {
    return {
      ok: true,
      status: "dry_run",
      type: options.type,
      sendKey: digest.sendKey,
      subject: digest.subject,
      itemCount: 0,
      recipientCount: 0,
      message: "Dry run found no eligible content and did not mutate send state.",
    };
  }

  if (digest.itemCount === 0) {
    await recordSkippedSend(env.DB, digest, "No eligible content after delay gate.");
    return {
      ok: true,
      status: "skipped",
      type: options.type,
      sendKey: digest.sendKey,
      subject: digest.subject,
      itemCount: 0,
      recipientCount: 0,
      message: "Recorded newsletter baseline without sending.",
    };
  }

  const subscribers = (await getConfirmedSubscribers(env.DB))
    .filter((subscriber) => subscriberWants(subscriber, digest.type));

  if (subscribers.length === 0) {
    await recordSkippedSend(env.DB, digest, "No confirmed subscribers for this newsletter type.");
    return {
      ok: true,
      status: "skipped",
      type: options.type,
      sendKey: digest.sendKey,
      subject: digest.subject,
      itemCount: digest.itemCount,
      recipientCount: 0,
      message: "No confirmed subscribers.",
    };
  }

  if (options.dryRun) {
    return {
      ok: true,
      status: "dry_run",
      type: options.type,
      sendKey: digest.sendKey,
      subject: digest.subject,
      itemCount: digest.itemCount,
      recipientCount: subscribers.length,
      message: "Dry run rendered without sending.",
    };
  }

  const config = deliveryConfig(env);
  if (!config.ok) {
    await recordFailedSend(env.DB, digest, subscribers.length, config.error);
    return {
      ok: false,
      status: "failed",
      type: options.type,
      sendKey: digest.sendKey,
      subject: digest.subject,
      itemCount: digest.itemCount,
      recipientCount: subscribers.length,
      error: config.error,
    };
  }

  const sendId = await beginSend(env.DB, digest, subscribers.length);
  const deliveries = await ensureDeliveries(env.DB, sendId, subscribers);

  if (deliveries.length === 0) {
    await finalizeSendIfComplete(env.DB, sendId);
    return {
      ok: true,
      status: "skipped",
      type: digest.type,
      sendKey: digest.sendKey,
      subject: digest.subject,
      itemCount: digest.itemCount,
      recipientCount: subscribers.length,
      message: "No unsent newsletter deliveries remain.",
    };
  }

  try {
    await enqueueNewsletterDeliveries({
      queue: config.queue,
      sendId,
      digest,
      deliveries,
    });
    return {
      ok: true,
      status: "sending",
      type: digest.type,
      sendKey: digest.sendKey,
      subject: digest.subject,
      itemCount: digest.itemCount,
      recipientCount: subscribers.length,
      message: "Newsletter deliveries queued for Cloudflare Email Service.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markDeliveriesFailed(env.DB, deliveries, message);
    await markSendFailed(env.DB, sendId, message);
    return {
      ok: false,
      status: "failed",
      type: digest.type,
      sendKey: digest.sendKey,
      subject: digest.subject,
      itemCount: digest.itemCount,
      recipientCount: subscribers.length,
      error: message,
    };
  }
}

export function renderNewsletterPreview(
  digest: DigestContent,
  options: {
    unsubscribeUrl?: string;
    mailingAddress?: string;
  } = {}
): { html: string; text: string } {
  return {
    html: renderHtmlEmail({
      subject: digest.subject,
      previewText: digest.previewText,
      mainHtml: digest.htmlMain,
      unsubscribeUrl: options.unsubscribeUrl ?? "https://venturedex.co/unsubscribe",
      mailingAddress: options.mailingAddress ?? "",
    }),
    text: renderTextEmail({
      subject: digest.subject,
      mainText: digest.textMain,
      unsubscribeUrl: options.unsubscribeUrl ?? "https://venturedex.co/unsubscribe",
      mailingAddress: options.mailingAddress ?? "",
    }),
  };
}

async function buildDailyDigest(
  db: D1Database,
  siteUrl: string,
  now: Date,
  force: boolean,
  env: NewsletterEnv
): Promise<DigestContent | null> {
  const delayHours = parsePositiveNumber(env.NEWSLETTER_DAILY_DELAY_HOURS, 6);
  const cutoff = addHours(now, -delayHours);
  const periodEnd = toD1DateTime(cutoff);
  const unfinished = await db
    .prepare(
      `SELECT period_start, period_end FROM newsletter_sends
       WHERE newsletter_type = 'daily'
         AND status IN ('sending','failed')
         AND item_count > 0
       ORDER BY datetime(created_at) DESC LIMIT 1`
    )
    .first<{ period_start: string | null; period_end: string | null }>();

  if (!force && unfinished?.period_start && unfinished.period_end) {
    return buildDailyDigestForPeriod(db, siteUrl, unfinished.period_start, unfinished.period_end);
  }

  const lastSent = await db
    .prepare(
      `SELECT period_end FROM newsletter_sends
       WHERE newsletter_type = 'daily' AND status IN ('sent','skipped')
       ORDER BY period_end DESC LIMIT 1`
    )
    .first<{ period_end: string | null }>();

  if (!lastSent?.period_end && !force && env.NEWSLETTER_BOOTSTRAP_DAILY !== "false") {
    return {
      type: "daily",
      sendKey: `daily:baseline:${periodEnd}`,
      subject: "VentureDex Daily baseline",
      previewText: "Daily newsletter baseline recorded.",
      periodStart: periodEnd,
      periodEnd,
      itemCount: 0,
      htmlMain: "",
      textMain: "",
    };
  }

  const periodStart = lastSent?.period_end ?? toD1DateTime(addHours(cutoff, -24));
  return buildDailyDigestForPeriod(db, siteUrl, periodStart, periodEnd);
}

async function buildWeeklyDigest(
  db: D1Database,
  siteUrl: string,
  now: Date,
  force: boolean,
  env: NewsletterEnv
): Promise<DigestContent | null> {
  const {
    getContentStartupBySlug,
    getPublishedWeeklyIssuesFromContent,
  } = await import("./weekly");
  const delayHours = parsePositiveNumber(env.NEWSLETTER_WEEKLY_DELAY_HOURS, 24);
  const maxAgeDays = parsePositiveNumber(env.NEWSLETTER_WEEKLY_MAX_AGE_DAYS, 21);
  const cutoff = addHours(now, -delayHours);
  const oldest = addHours(now, -maxAgeDays * 24);
  const issues = getPublishedWeeklyIssuesFromContent(20);

  for (const issue of issues) {
    if (!issue.published_at) continue;
    const publishedAt = parseDateLike(issue.published_at);
    if (!publishedAt) continue;
    if (!force && (publishedAt > cutoff || publishedAt < oldest)) continue;

    const sendKey = `weekly:${issue.issue_number}`;
    const existing = await db
      .prepare("SELECT status FROM newsletter_sends WHERE send_key = ? AND status = 'sent'")
      .bind(sendKey)
      .first<{ status: string }>();
    if (existing && !force) continue;

    return buildWeeklyDigestForIssue(db, siteUrl, issue.issue_number);
  }

  return null;
}

async function buildDailyDigestForPeriod(
  db: D1Database,
  siteUrl: string,
  periodStart: string,
  periodEnd: string
): Promise<DigestContent> {
  const rows = await db
    .prepare(
      `SELECT * FROM startups
       WHERE workflow_status = 'published'
         AND published_at IS NOT NULL
         AND published_at > ?
         AND published_at <= ?
       ORDER BY published_at ASC, product_name ASC`
    )
    .bind(periodStart, periodEnd)
    .all<Startup>();

  const items: DailyStartupItem[] = [];
  for (const startup of rows.results) {
    const rounds = await getFundingRoundsForStartup(db, startup.slug);
    items.push({
      startup,
      funding: rounds[0] ?? null,
      research: parseResearch(startup.research_json),
    });
  }

  return buildDailyDigestContent({
    items,
    siteUrl,
    periodStart,
    periodEnd,
  });
}

async function buildWeeklyDigestForIssue(
  db: D1Database,
  siteUrl: string,
  issueNumber: number
): Promise<DigestContent | null> {
  const {
    getContentStartupBySlug,
    getPublishedWeeklyIssuesFromContent,
  } = await import("./weekly");
  const issue = getPublishedWeeklyIssuesFromContent(50)
    .find((candidate) => candidate.issue_number === issueNumber);
  if (!issue) return null;

  const startups = new Map<string, Startup>();
  for (const pick of issue.picks) {
    const startup = await getStartupBySlug(db, pick.slug);
    const contentStartup = getContentStartupBySlug(pick.slug);
    if (startup ?? contentStartup) {
      startups.set(pick.slug, startup ?? contentStartup!);
    }
  }

  return buildWeeklyDigestContent({
    issue,
    startups,
    siteUrl,
  });
}

export function buildDailyDigestContent(input: {
  items: DailyStartupItem[];
  siteUrl: string;
  periodStart: string;
  periodEnd: string;
}): DigestContent {
  const itemCount = input.items.length;
  const names = input.items.slice(0, 3).map(({ startup }) => startup.product_name).join(", ");
  const subject = itemCount === 1
    ? `VentureDex Daily: ${input.items[0].startup.product_name}`
    : `VentureDex Daily: ${itemCount} new startups`;
  const previewText = itemCount > 0
    ? `New startup profiles after editorial review${names ? `: ${names}` : ""}.`
    : "No new VentureDex profiles passed the delay gate.";

  const itemHtml = input.items.map(({ startup, funding, research }) => startupCardHtml({
    startup,
    funding,
    research,
    siteUrl: input.siteUrl,
  })).join("");

  const itemText = input.items.map(({ startup, funding, research }, index) => startupText({
    index,
    startup,
    funding,
    research,
    siteUrl: input.siteUrl,
  })).join("\n\n");

  const dateLabel = formatDate(input.periodEnd);
  const htmlMain = `
    ${sectionKicker("Daily additions", `${itemCount} ${itemCount === 1 ? "profile" : "profiles"} ready after review`)}
    <h1 style="${styles.h1}">New on VentureDex</h1>
    <p style="${styles.lede}">These companies were published after the editorial delay window, so the site record had time for cleanup before reaching inboxes.</p>
    <div style="${styles.metaLine}">Digest cutoff: ${escapeHtml(dateLabel)}</div>
    ${itemHtml || emptyHtml("No new startup profiles passed the delay gate.")}
  `;

  const textMain = [
    "Daily additions",
    `Cutoff: ${dateLabel}`,
    "",
    itemText || "No new startup profiles passed the delay gate.",
  ].join("\n");

  return {
    type: "daily",
    sendKey: `daily:${input.periodStart}:${input.periodEnd}`,
    subject,
    previewText,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    itemCount,
    htmlMain,
    textMain,
  };
}

export function buildWeeklyDigestContent(input: {
  issue: WeeklyIssueContent;
  startups: Map<string, Startup>;
  siteUrl: string;
}): DigestContent {
  const { issue } = input;
  const subject = `VentureDex Weekly #${issue.issue_number}: ${issue.title}`;
  const previewText = issue.research_summary || issue.editorial_intro;
  const issueUrl = absoluteUrl(input.siteUrl, `/weekly/${issue.issue_number}`);

  const themesHtml = issue.themes.length
    ? `<div style="${styles.themeGrid}">${issue.themes.map((theme) => `
        <div style="${styles.themeBox}">
          <h3 style="${styles.cardTitle}">${escapeHtml(theme.title)}</h3>
          <p style="${styles.bodySmall}">${escapeHtml(theme.summary)}</p>
        </div>
      `).join("")}</div>`
    : "";

  const picksHtml = issue.picks.map((pick, index) => {
    const startup = input.startups.get(pick.slug);
    if (!startup) return "";
    const startupUrl = absoluteUrl(input.siteUrl, `/startups/${startup.slug}`);
    return `
      <article style="${styles.card}">
        <div style="${styles.kicker}">#${index + 1} ${escapeHtml(metaLabel(startup))}</div>
        <h2 style="${styles.cardTitle}"><a href="${escapeAttr(startupUrl)}" style="${styles.titleLink}">${escapeHtml(startup.product_name)}</a></h2>
        ${startup.summary ? `<p style="${styles.summary}">${escapeHtml(startup.summary)}</p>` : ""}
        <div style="${styles.rule}"></div>
        ${analysisBlock("Why this week", pick.why_this_week)}
        ${analysisBlock("Product evaluation", pick.product_evaluation)}
        ${weeklyEvidenceHtml(pick.evidence)}
        ${weeklyRisksHtml(pick.risks)}
        ${pick.verdict ? `<p style="${styles.verdict}">${escapeHtml(pick.verdict)}</p>` : ""}
      </article>
    `;
  }).join("");

  const picksText = issue.picks.map((pick, index) => {
    const startup = input.startups.get(pick.slug);
    if (!startup) return "";
    return [
      `${index + 1}. ${startup.product_name}`,
      startup.summary ?? "",
      `Why this week: ${pick.why_this_week}`,
      `Product evaluation: ${pick.product_evaluation}`,
      pick.evidence.length
        ? `Evidence used: ${pick.evidence.map((item) => `${item.label} (${item.source})`).join("; ")}`
        : "",
      pick.risks.length ? `Limits and risks: ${pick.risks.join("; ")}` : "",
      pick.verdict ? `Verdict: ${pick.verdict}` : "",
      absoluteUrl(input.siteUrl, `/startups/${startup.slug}`),
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  const htmlMain = `
    ${sectionKicker("Weekly research", `${issue.picks.length} evidence-bound picks`)}
    <h1 style="${styles.h1}">${escapeHtml(issue.title)}</h1>
    <p style="${styles.lede}">${escapeHtml(issue.editorial_intro)}</p>
    ${issue.research_summary ? `<p style="${styles.body}">${escapeHtml(issue.research_summary)}</p>` : ""}
    <p style="${styles.ctaWrap}"><a href="${escapeAttr(issueUrl)}" style="${styles.cta}">Read the full issue</a></p>
    ${themesHtml}
    ${picksHtml}
  `;

  const textMain = [
    `Weekly #${issue.issue_number}: ${issue.title}`,
    issue.editorial_intro,
    issue.research_summary,
    "",
    picksText,
    "",
    `Full issue: ${issueUrl}`,
  ].filter(Boolean).join("\n");

  return {
    type: "weekly",
    sendKey: `weekly:${issue.issue_number}`,
    subject,
    previewText,
    periodStart: issue.week_start,
    periodEnd: issue.week_end ?? issue.published_at,
    itemCount: issue.picks.length,
    htmlMain,
    textMain,
  };
}

function weeklyEvidenceHtml(evidence: WeeklyIssueContent["picks"][number]["evidence"]): string {
  if (!evidence.length) return "";
  return `
    <div style="${styles.analysisBlock}">
      <h3 style="${styles.blockTitle}">Evidence used</h3>
      ${evidence.slice(0, 3).map((item) => `
        <p style="${styles.bodySmall}">
          ${item.url
            ? `<a href="${escapeAttr(item.url)}" style="${styles.inlineLink}">${escapeHtml(item.label)}</a>`
            : escapeHtml(item.label)}
          <br><span style="${styles.sourceText}">${escapeHtml(item.source)}</span>
        </p>
      `).join("")}
    </div>
  `;
}

function weeklyRisksHtml(risks: string[]): string {
  if (!risks.length) return "";
  return `
    <div style="${styles.analysisBlock}">
      <h3 style="${styles.blockTitle}">Limits and risks</h3>
      ${risks.slice(0, 3).map((risk) => `<p style="${styles.bodySmall}">${escapeHtml(risk)}</p>`).join("")}
    </div>
  `;
}

export function buildCloudflareEmailMessage(input: {
  digest: DigestContent;
  subscription: NewsletterSubscription;
  siteUrl: string;
  from: SenderAddress;
  replyTo?: SenderAddress;
  mailingAddress: string;
}) {
  const token = input.subscription.unsubscribe_token ?? "";
  const unsubscribeUrl = absoluteUrl(input.siteUrl, `/unsubscribe?token=${encodeURIComponent(token)}`);
  const oneClickUnsubscribeUrl = absoluteUrl(input.siteUrl, `/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`);
  const rendered = renderNewsletterPreview(input.digest, {
    unsubscribeUrl,
    mailingAddress: input.mailingAddress,
  });

  return {
    from: input.from,
    to: input.subscription.email,
    replyTo: input.replyTo,
    subject: input.digest.subject,
    html: rendered.html,
    text: rendered.text,
    headers: {
      "List-Unsubscribe": `<${oneClickUnsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "List-Id": "VentureDex Newsletter <newsletter.venturedex.co>",
      "Precedence": "bulk",
      "X-Campaign-ID": sanitizeHeaderValue(input.digest.sendKey),
    },
  };
}

export function validateCloudflareEmailMessage(
  message: ReturnType<typeof buildCloudflareEmailMessage>
): void {
  if (message.subject.length > CLOUDFLARE_MAX_SUBJECT_LENGTH) {
    throw new Error("Cloudflare Email subject exceeds 998 characters.");
  }

  const headers = message.headers ?? {};
  let headerBytes = 0;
  for (const [name, value] of Object.entries(headers)) {
    if (!isAllowedCloudflareEmailHeader(name)) {
      throw new Error(`Cloudflare Email header is not allowed: ${name}`);
    }
    if (!/^[A-Za-z0-9-]{1,100}$/.test(name) && !/^X-[A-Za-z0-9\-_]{1,98}$/.test(name)) {
      throw new Error(`Invalid Cloudflare Email header name: ${name}`);
    }
    if (!value || /[\r\n]/.test(value)) {
      throw new Error(`Invalid Cloudflare Email header value for ${name}.`);
    }
    if (name.toLowerCase() === "list-unsubscribe" && !/<https:\/\/[^>]+>/.test(value)) {
      throw new Error("Cloudflare Email List-Unsubscribe must include an HTTPS URL.");
    }
    if (name.toLowerCase() === "list-unsubscribe-post" && value !== "List-Unsubscribe=One-Click") {
      throw new Error("Cloudflare Email List-Unsubscribe-Post must use the one-click value.");
    }
    const valueBytes = byteLength(value);
    if (valueBytes > CLOUDFLARE_MAX_HEADER_VALUE_BYTES) {
      throw new Error(`Cloudflare Email header ${name} exceeds 2,048 bytes.`);
    }
    headerBytes += byteLength(name) + 2 + valueBytes + 2;
  }
  if (headerBytes > CLOUDFLARE_MAX_HEADER_BYTES) {
    throw new Error("Cloudflare Email custom headers exceed 16 KB.");
  }

  const messageBytes = byteLength(message.subject) + byteLength(message.html ?? "") + byteLength(message.text ?? "");
  if (messageBytes > CLOUDFLARE_MAX_MESSAGE_BYTES) {
    throw new Error("Cloudflare Email message exceeds 5 MiB.");
  }
}

function isAllowedCloudflareEmailHeader(name: string): boolean {
  if (/^X-[A-Za-z0-9\-_]{1,98}$/.test(name)) return true;
  return [
    "List-Unsubscribe",
    "List-Unsubscribe-Post",
    "List-Id",
    "Precedence",
  ].includes(name);
}

async function enqueueNewsletterDeliveries(input: {
  queue: Queue<NewsletterQueueMessage>;
  sendId: string;
  digest: DigestContent;
  deliveries: Array<{ id: string }>;
}): Promise<void> {
  const messages = input.deliveries.map((delivery) => ({
    body: {
      sendId: input.sendId,
      deliveryId: delivery.id,
      newsletterType: input.digest.type,
      sendKey: input.digest.sendKey,
    },
    contentType: "json" as const,
  }));

  for (const batch of chunk(messages, QUEUE_BATCH_SIZE)) {
    await input.queue.sendBatch(batch);
  }
}

export async function processNewsletterDeliveryQueue(
  env: NewsletterEnv,
  batch: MessageBatch<NewsletterQueueMessage>
): Promise<void> {
  for (const message of batch.messages) {
    const body = message.body;
    if (!isNewsletterQueueMessage(body)) {
      message.ack();
      continue;
    }
    try {
      await sendQueuedNewsletterDelivery(env, body);
      message.ack();
    } catch (error) {
      const normalized = normalizeEmailServiceError(error);
      if (isPermanentEmailServiceError(normalized.code) || message.attempts >= 5) {
        await markQueuedDeliveryFailed(env.DB, body, normalized.message);
        message.ack();
      } else {
        message.retry({ delaySeconds: retryDelaySeconds(message.attempts) });
      }
    }
  }
}

async function sendQueuedNewsletterDelivery(
  env: NewsletterEnv,
  message: NewsletterQueueMessage
): Promise<void> {
  const config = emailConfig(env);
  if (!config.ok) {
    throw emailServiceError("E_NEWSLETTER_CONFIG", config.error);
  }

  const claimToken = await claimDelivery(env.DB, message.deliveryId, message.sendId);
  if (!claimToken) return;

  const context = await getQueuedDeliveryContext(env.DB, message.deliveryId, message.sendId);
  if (!context) return;
  if (context.delivery_status === "sent" || context.delivery_status === "skipped") return;
  if (context.delivery_status === "failed") return;

  const subscription: NewsletterSubscription = {
    id: context.subscription_id,
    email: context.email,
    status: context.subscription_status,
    preferences_json: context.preferences_json,
    unsubscribe_token: context.unsubscribe_token,
    created_at: null,
    confirmed_at: null,
    unsubscribed_at: null,
    updated_at: null,
  };

  if (subscription.status !== "confirmed" || !subscriberWants(subscription, context.newsletter_type)) {
    await markDeliverySkipped(env.DB, context.delivery_id, "Subscriber is no longer eligible for this newsletter type.");
    await finalizeSendIfComplete(env.DB, context.send_id);
    return;
  }

  const siteUrl = normalizeSiteUrl(env.SITE_URL);
  const digest = digestFromSendContext(context);

  if (!digest) {
    throw emailServiceError("E_NEWSLETTER_CONTENT", `Could not rebuild digest for ${context.send_key}.`);
  }

  const emailMessage = buildCloudflareEmailMessage({
    digest,
    subscription,
    siteUrl,
    from: config.from,
    replyTo: config.replyTo,
    mailingAddress: config.mailingAddress,
  });
  validateCloudflareEmailMessage(emailMessage);

  let response: EmailSendResult;
  try {
    response = await config.email.send(emailMessage);
  } catch (error) {
    await releaseDeliveryClaim(env.DB, context.delivery_id, claimToken, error instanceof Error ? error.message : String(error));
    throw error;
  }
  await markDeliverySent(env.DB, context.delivery_id, claimToken, response.messageId);
  await finalizeSendIfComplete(env.DB, context.send_id);
}

async function getSubscriptionByEmail(
  db: D1Database,
  email: string
): Promise<NewsletterSubscription | null> {
  return db
    .prepare("SELECT * FROM newsletter_subscriptions WHERE email = ?")
    .bind(email)
    .first<NewsletterSubscription>();
}

async function getConfirmedSubscribers(db: D1Database): Promise<NewsletterSubscription[]> {
  const result = await db
    .prepare(
      `SELECT * FROM newsletter_subscriptions
       WHERE status = 'confirmed'
       ORDER BY datetime(created_at) ASC`
    )
    .all<NewsletterSubscription>();
  const subscribers = result.results;
  const missingTokens = subscribers.filter((subscriber) => !subscriber.unsubscribe_token);
  for (const subscriber of missingTokens) {
    const token = crypto.randomUUID();
    await db
      .prepare(
        `UPDATE newsletter_subscriptions
         SET unsubscribe_token = ?, updated_at = datetime('now')
         WHERE id = ? AND (unsubscribe_token IS NULL OR unsubscribe_token = '')`
      )
      .bind(token, subscriber.id)
      .run();
    subscriber.unsubscribe_token = token;
  }
  return subscribers;
}

async function beginSend(
  db: D1Database,
  digest: DigestContent,
  recipientCount: number
): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO newsletter_sends (
         id, send_key, newsletter_type, status, subject, preview_text,
         html_main, text_main, period_start, period_end, item_count, recipient_count, provider, updated_at
       )
       VALUES (?, ?, ?, 'sending', ?, ?, ?, ?, ?, ?, ?, ?, 'cloudflare_email_service', datetime('now'))
       ON CONFLICT(send_key) DO UPDATE SET
         status = 'sending',
         provider = 'cloudflare_email_service',
         subject = excluded.subject,
         preview_text = excluded.preview_text,
         html_main = excluded.html_main,
         text_main = excluded.text_main,
         period_start = excluded.period_start,
         period_end = excluded.period_end,
         item_count = excluded.item_count,
         recipient_count = excluded.recipient_count,
         error_log = NULL,
         updated_at = datetime('now')`
    )
    .bind(
      id,
      digest.sendKey,
      digest.type,
      digest.subject,
      digest.previewText,
      digest.htmlMain,
      digest.textMain,
      digest.periodStart,
      digest.periodEnd,
      digest.itemCount,
      recipientCount
    )
    .run();

  const row = await db
    .prepare("SELECT id FROM newsletter_sends WHERE send_key = ?")
    .bind(digest.sendKey)
    .first<{ id: string }>();

  if (!row) throw new Error("Newsletter send row was not created.");
  return row.id;
}

async function ensureDeliveries(
  db: D1Database,
  sendId: string,
  subscribers: NewsletterSubscription[]
): Promise<Array<{ id: string; subscription_id: string; email: string }>> {
  if (subscribers.length === 0) return [];

  await db.batch(subscribers.map((subscriber) => {
    const id = crypto.randomUUID();
    return db.prepare(
        `INSERT INTO newsletter_deliveries (id, send_id, subscription_id, email, status, updated_at)
         VALUES (?, ?, ?, ?, 'queued', datetime('now'))
         ON CONFLICT(send_id, subscription_id) DO UPDATE SET
           email = excluded.email,
           status = CASE
             WHEN newsletter_deliveries.status = 'sent' THEN 'sent'
             ELSE 'queued'
           END,
           provider_message_id = CASE
             WHEN newsletter_deliveries.status = 'sent' THEN newsletter_deliveries.provider_message_id
             ELSE NULL
           END,
           error_message = NULL,
           updated_at = datetime('now')`
      )
      .bind(id, sendId, subscriber.id, subscriber.email);
  }));

  const result = await db
    .prepare(
      `SELECT id, subscription_id, email
       FROM newsletter_deliveries
       WHERE send_id = ? AND status != 'sent'`
    )
    .bind(sendId)
    .all<{ id: string; subscription_id: string; email: string }>();

  return result.results;
}

interface QueuedDeliveryContext {
  delivery_id: string;
  delivery_status: "queued" | "sent" | "skipped" | "failed";
  send_id: string;
  send_key: string;
  newsletter_type: NewsletterType;
  subject: string;
  preview_text: string;
  html_main: string;
  text_main: string;
  item_count: number;
  period_start: string | null;
  period_end: string | null;
  subscription_id: string;
  email: string;
  subscription_status: "pending" | "confirmed" | "unsubscribed";
  preferences_json: string | null;
  unsubscribe_token: string | null;
}

async function getQueuedDeliveryContext(
  db: D1Database,
  deliveryId: string,
  sendId: string
): Promise<QueuedDeliveryContext | null> {
  return db
    .prepare(
      `SELECT
         d.id AS delivery_id,
         d.status AS delivery_status,
         s.id AS send_id,
         s.send_key,
         s.newsletter_type,
         s.subject,
         s.preview_text,
         s.html_main,
         s.text_main,
         s.item_count,
         s.period_start,
         s.period_end,
         n.id AS subscription_id,
         n.email,
         n.status AS subscription_status,
         n.preferences_json,
         n.unsubscribe_token
       FROM newsletter_deliveries d
       JOIN newsletter_sends s ON s.id = d.send_id
       JOIN newsletter_subscriptions n ON n.id = d.subscription_id
       WHERE d.id = ? AND s.id = ?`
    )
    .bind(deliveryId, sendId)
    .first<QueuedDeliveryContext>();
}

async function claimDelivery(
  db: D1Database,
  deliveryId: string,
  sendId: string
): Promise<string | null> {
  const claimToken = `claim:${crypto.randomUUID()}`;
  const result = await db
    .prepare(
      `UPDATE newsletter_deliveries
       SET provider_message_id = ?,
           error_message = NULL,
           updated_at = datetime('now')
       WHERE id = ?
         AND send_id = ?
         AND status = 'queued'
         AND (
           provider_message_id IS NULL
           OR provider_message_id = ''
           OR (provider_message_id LIKE 'claim:%' AND datetime(updated_at) < datetime('now', '-30 minutes'))
         )`
    )
    .bind(claimToken, deliveryId, sendId)
    .run();

  return result.meta.changes > 0 ? claimToken : null;
}

async function releaseDeliveryClaim(
  db: D1Database,
  deliveryId: string,
  claimToken: string,
  error: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE newsletter_deliveries
       SET provider_message_id = NULL,
           error_message = ?,
           updated_at = datetime('now')
       WHERE id = ?
         AND status = 'queued'
         AND provider_message_id = ?`
    )
    .bind(error.slice(0, 1000), deliveryId, claimToken)
    .run();
}

async function markDeliverySent(
  db: D1Database,
  deliveryId: string,
  claimToken: string,
  providerMessageId: string | null
): Promise<void> {
  await db
    .prepare(
      `UPDATE newsletter_deliveries
       SET status = 'sent',
           provider_message_id = ?,
           error_message = NULL,
           sent_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ? AND status = 'queued' AND provider_message_id = ?`
    )
    .bind(providerMessageId, deliveryId, claimToken)
    .run();
}

async function markDeliverySkipped(
  db: D1Database,
  deliveryId: string,
  reason: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE newsletter_deliveries
       SET status = 'skipped',
           error_message = ?,
           updated_at = datetime('now')
       WHERE id = ? AND status != 'sent'`
    )
    .bind(reason.slice(0, 1000), deliveryId)
    .run();
}

async function markQueuedDeliveryFailed(
  db: D1Database,
  message: NewsletterQueueMessage,
  error: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE newsletter_deliveries
       SET status = 'failed',
           error_message = ?,
           updated_at = datetime('now')
       WHERE id = ? AND send_id = ? AND status != 'sent'`
    )
    .bind(error.slice(0, 1000), message.deliveryId, message.sendId)
    .run();
  await finalizeSendIfComplete(db, message.sendId);
}

async function markDeliveriesFailed(
  db: D1Database,
  deliveries: Array<{ id: string }>,
  error: string
): Promise<void> {
  for (const delivery of deliveries) {
    await db
      .prepare(
        `UPDATE newsletter_deliveries
         SET status = 'failed',
             error_message = ?,
             updated_at = datetime('now')
         WHERE id = ? AND status != 'sent'`
      )
      .bind(error.slice(0, 1000), delivery.id)
      .run();
  }
}

async function finalizeSendIfComplete(db: D1Database, sendId: string): Promise<void> {
  const counts = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
         SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped
       FROM newsletter_deliveries
       WHERE send_id = ?`
    )
    .bind(sendId)
    .first<{ queued: number | null; failed: number | null; sent: number | null; skipped: number | null }>();

  if (!counts || Number(counts.queued ?? 0) > 0) return;

  const failed = Number(counts.failed ?? 0);
  const sent = Number(counts.sent ?? 0);
  const skipped = Number(counts.skipped ?? 0);
  const terminalStatus = failed > 0 ? "failed" : "sent";
  const errorLog = failed > 0
    ? `${failed} newsletter deliveries failed; ${sent} sent; ${skipped} skipped.`
    : null;

  await db
    .prepare(
      `UPDATE newsletter_sends
       SET status = ?,
           provider = 'cloudflare_email_service',
           error_log = ?,
           sent_at = CASE WHEN ? = 'sent' THEN COALESCE(sent_at, datetime('now')) ELSE sent_at END,
           updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(terminalStatus, errorLog, terminalStatus, sendId)
    .run();
}

async function recordSkippedSend(
  db: D1Database,
  digest: DigestContent,
  reason: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO newsletter_sends (
         id, send_key, newsletter_type, status, subject, preview_text,
         period_start, period_end, item_count, recipient_count, provider, error_log, updated_at
       )
       VALUES (?, ?, ?, 'skipped', ?, ?, ?, ?, ?, 0, 'cloudflare_email_service', ?, datetime('now'))
       ON CONFLICT(send_key) DO UPDATE SET
         status = 'skipped',
         provider = 'cloudflare_email_service',
         subject = excluded.subject,
         preview_text = excluded.preview_text,
         period_start = excluded.period_start,
         period_end = excluded.period_end,
         item_count = excluded.item_count,
         recipient_count = 0,
         error_log = excluded.error_log,
         updated_at = datetime('now')`
    )
    .bind(
      crypto.randomUUID(),
      digest.sendKey,
      digest.type,
      digest.subject,
      digest.previewText,
      digest.periodStart,
      digest.periodEnd,
      digest.itemCount,
      reason
    )
    .run();
}

async function recordFailedSend(
  db: D1Database,
  digest: DigestContent,
  recipientCount: number,
  error: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO newsletter_sends (
         id, send_key, newsletter_type, status, subject, preview_text,
         period_start, period_end, item_count, recipient_count, provider, error_log, updated_at
       )
       VALUES (?, ?, ?, 'failed', ?, ?, ?, ?, ?, ?, 'cloudflare_email_service', ?, datetime('now'))
       ON CONFLICT(send_key) DO UPDATE SET
         status = 'failed',
         provider = 'cloudflare_email_service',
         recipient_count = excluded.recipient_count,
         error_log = excluded.error_log,
         updated_at = datetime('now')`
    )
    .bind(
      crypto.randomUUID(),
      digest.sendKey,
      digest.type,
      digest.subject,
      digest.previewText,
      digest.periodStart,
      digest.periodEnd,
      digest.itemCount,
      recipientCount,
      error
    )
    .run();
}

async function markSendFailed(db: D1Database, sendId: string, error: string): Promise<void> {
  await db
    .prepare(
      `UPDATE newsletter_sends
       SET status = 'failed',
           provider = 'cloudflare_email_service',
           error_log = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(error.slice(0, 2000), sendId)
    .run();
}

type SenderAddress = string | { email: string; name: string };

function deliveryConfig(env: NewsletterEnv):
  | { ok: true; queue: Queue<NewsletterQueueMessage> }
  | { ok: false; error: string } {
  if (!env.NEWSLETTER_DELIVERY_QUEUE) {
    return {
      ok: false,
      error: "NEWSLETTER_DELIVERY_QUEUE binding is required for Cloudflare newsletter delivery.",
    };
  }
  const email = emailConfig(env);
  if (!email.ok) return email;
  return { ok: true, queue: env.NEWSLETTER_DELIVERY_QUEUE };
}

function emailConfig(env: NewsletterEnv):
  | { ok: true; email: SendEmail; from: SenderAddress; replyTo?: SenderAddress; mailingAddress: string }
  | { ok: false; error: string } {
  if (!env.EMAIL) {
    return { ok: false, error: "EMAIL binding is required for Cloudflare Email Service sending." };
  }
  if (!env.NEWSLETTER_FROM) {
    return { ok: false, error: "NEWSLETTER_FROM is required for newsletter sending." };
  }
  const from = parseSenderAddress(env.NEWSLETTER_FROM);
  if (!from) {
    return { ok: false, error: "NEWSLETTER_FROM must be a valid sender email or display name with email." };
  }
  if (!env.NEWSLETTER_MAILING_ADDRESS) {
    return { ok: false, error: "NEWSLETTER_MAILING_ADDRESS is required for compliant newsletter sending." };
  }
  const replyTo = env.NEWSLETTER_REPLY_TO ? parseSenderAddress(env.NEWSLETTER_REPLY_TO) : undefined;
  if (env.NEWSLETTER_REPLY_TO && !replyTo) {
    return { ok: false, error: "NEWSLETTER_REPLY_TO must be a valid email address when set." };
  }
  return {
    ok: true,
    email: env.EMAIL,
    from,
    replyTo,
    mailingAddress: env.NEWSLETTER_MAILING_ADDRESS,
  };
}

function parseSenderAddress(value: string): SenderAddress | undefined {
  const trimmed = value.trim();
  const displayMatch = /^(.*?)\s*<([^<>]+)>$/.exec(trimmed);
  if (displayMatch) {
    const email = normalizeEmail(displayMatch[2]);
    const name = displayMatch[1].replace(/^"|"$/g, "").trim();
    if (!email) return undefined;
    return name ? { email, name: name.slice(0, 100) } : email;
  }
  return normalizeEmail(trimmed) ?? undefined;
}

function digestFromSendContext(send: {
  newsletter_type: NewsletterType;
  send_key: string;
  subject: string;
  preview_text: string;
  html_main: string;
  text_main: string;
  period_start: string | null;
  period_end: string | null;
  item_count: number;
}): DigestContent | null {
  if (!send.html_main || !send.text_main) return null;
  return {
    type: send.newsletter_type,
    sendKey: send.send_key,
    subject: send.subject,
    previewText: send.preview_text,
    periodStart: send.period_start,
    periodEnd: send.period_end,
    itemCount: send.item_count,
    htmlMain: send.html_main,
    textMain: send.text_main,
  };
}

function emailServiceError(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function isNewsletterQueueMessage(value: unknown): value is NewsletterQueueMessage {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.sendId === "string"
    && typeof record.deliveryId === "string"
    && (record.newsletterType === "daily" || record.newsletterType === "weekly")
    && typeof record.sendKey === "string";
}

function normalizeEmailServiceError(error: unknown): { code: string; message: string } {
  if (error && typeof error === "object") {
    const record = error as { code?: unknown; message?: unknown };
    return {
      code: typeof record.code === "string" ? record.code : "E_UNKNOWN",
      message: typeof record.message === "string" ? record.message : String(error),
    };
  }
  return { code: "E_UNKNOWN", message: String(error) };
}

function isPermanentEmailServiceError(code: string): boolean {
  return ![
    "E_RATE_LIMIT_EXCEEDED",
    "E_INTERNAL_SERVER_ERROR",
    "E_UNKNOWN",
  ].includes(code);
}

function retryDelaySeconds(attempts: number): number {
  return Math.min(3600, 60 * 2 ** Math.max(0, attempts - 1));
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[^A-Za-z0-9:._-]/g, "-").slice(0, 200);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function subscriberWants(subscription: NewsletterSubscription, type: NewsletterType): boolean {
  const preferences = parsePreferencesJson(subscription.preferences_json);
  return preferences[type];
}

function parsePreferencesJson(value: string | null): NewsletterPreferences {
  if (!value) return { ...DEFAULT_PREFERENCES };
  try {
    return parseNewsletterPreferences(JSON.parse(value));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

function parseResearch(value: string | null): StartupResearch | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as StartupResearch;
  } catch {
    return null;
  }
}

function renderHtmlEmail(input: {
  subject: string;
  previewText: string;
  mainHtml: string;
  unsubscribeUrl: string;
  mailingAddress: string;
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="${styles.pageBody}">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.previewText)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="${styles.shell}">
      <tr>
        <td align="center" style="${styles.outerCell}">
          <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="${styles.container}">
            <tr>
              <td style="${styles.header}">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="${styles.headerTable}">
                  <tr>
                    <td align="left"><a href="https://venturedex.co" style="${styles.logo}">VentureDex</a></td>
                    <td align="right" style="${styles.headerMeta}">Curated startup research</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="${styles.content}">
                ${input.mainHtml}
              </td>
            </tr>
            <tr>
              <td style="${styles.footer}">
                <p style="${styles.footerText}">You are receiving this because you subscribed to VentureDex startup research.</p>
                <p style="${styles.footerText}"><a href="${escapeAttr(input.unsubscribeUrl)}" style="${styles.footerLink}">Unsubscribe</a></p>
                ${input.mailingAddress ? `<p style="${styles.footerText}">${escapeHtml(input.mailingAddress)}</p>` : ""}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderTextEmail(input: {
  subject: string;
  mainText: string;
  unsubscribeUrl: string;
  mailingAddress: string;
}) {
  return [
    "VentureDex",
    input.subject,
    "",
    input.mainText,
    "",
    "You are receiving this because you subscribed to VentureDex startup research.",
    `Unsubscribe: ${input.unsubscribeUrl}`,
    input.mailingAddress,
  ].filter(Boolean).join("\n");
}

function startupCardHtml(input: {
  startup: Startup;
  funding: FundingRound | null;
  research: StartupResearch | null;
  siteUrl: string;
}) {
  const { startup, funding, research, siteUrl } = input;
  const startupUrl = absoluteUrl(siteUrl, `/startups/${startup.slug}`);
  const fundingText = funding
    ? `${funding.amount ? `${funding.amount} ` : ""}${funding.stage}${funding.lead_investor ? ` led by ${funding.lead_investor}` : ""}`
    : startup.funding_stage;
  const evidence = research?.product_evidence?.slice(0, 2) ?? [];
  const risk = research?.risks?.[0]?.claim;
  const context = research?.market_context;

  return `
    <article style="${styles.card}">
      <div style="${styles.kicker}">${escapeHtml(metaLabel(startup))}</div>
      <h2 style="${styles.cardTitle}"><a href="${escapeAttr(startupUrl)}" style="${styles.titleLink}">${escapeHtml(startup.product_name)}</a></h2>
      ${startup.summary ? `<p style="${styles.summary}">${escapeHtml(startup.summary)}</p>` : ""}
      ${fundingText ? `<p style="${styles.badgeLine}">${escapeHtml(fundingText)}</p>` : ""}
      ${startup.editor_note ? `<p style="${styles.body}">${escapeHtml(startup.editor_note)}</p>` : ""}
      ${evidence.length ? `
        <div style="${styles.rule}"></div>
        <h3 style="${styles.blockTitle}">Product evidence</h3>
        ${evidence.map((item) => evidenceHtml(item, research)).join("")}
      ` : ""}
      ${context?.why_now ? analysisBlock("Market context", context.why_now) : ""}
      ${risk ? analysisBlock("Open question", risk) : ""}
      <p style="${styles.ctaWrap}"><a href="${escapeAttr(startupUrl)}" style="${styles.cta}">Read profile</a></p>
    </article>
  `;
}

function startupText(input: {
  index: number;
  startup: Startup;
  funding: FundingRound | null;
  research: StartupResearch | null;
  siteUrl: string;
}) {
  const lines = [
    `${input.index + 1}. ${input.startup.product_name}`,
    input.startup.summary,
    input.funding
      ? `Funding: ${input.funding.amount ? `${input.funding.amount} ` : ""}${input.funding.stage}${input.funding.lead_investor ? ` led by ${input.funding.lead_investor}` : ""}`
      : null,
    input.startup.editor_note,
    input.research?.product_evidence?.[0]?.claim
      ? `Product evidence: ${input.research.product_evidence[0].claim}${sourceText(input.research.product_evidence[0], input.research)}`
      : null,
    input.research?.risks?.[0]?.claim ? `Open question: ${input.research.risks[0].claim}` : null,
    absoluteUrl(input.siteUrl, `/startups/${input.startup.slug}`),
  ];
  return lines.filter(Boolean).join("\n");
}

function evidenceHtml(
  item: StartupResearch["product_evidence"][number],
  research: StartupResearch | null
): string {
  const sources = sourceLinks(item, research);
  return `
    <p style="${styles.bodySmall}">
      ${escapeHtml(item.claim)}
      ${sources ? `<br><span style="${styles.sourceText}">${sources}</span>` : ""}
    </p>
  `;
}

function sourceLinks(
  item: StartupResearch["product_evidence"][number],
  research: StartupResearch | null
): string {
  if (!research?.sources?.length || !item.source_ids?.length) return "";
  return item.source_ids
    .map((sourceId) => research.sources.find((source) => source.id === sourceId))
    .filter((source): source is StartupResearch["sources"][number] => Boolean(source))
    .map((source) => source.url
      ? `<a href="${escapeAttr(source.url)}" style="${styles.inlineLink}">${escapeHtml(source.label)}</a>`
      : escapeHtml(source.label))
    .join(" · ");
}

function sourceText(
  item: StartupResearch["product_evidence"][number],
  research: StartupResearch | null
): string {
  if (!research?.sources?.length || !item.source_ids?.length) return "";
  const labels = item.source_ids
    .map((sourceId) => research.sources.find((source) => source.id === sourceId)?.label)
    .filter(Boolean);
  return labels.length ? ` (Sources: ${labels.join(", ")})` : "";
}

function analysisBlock(label: string, value: string) {
  if (!value) return "";
  return `
    <div style="${styles.analysisBlock}">
      <h3 style="${styles.blockTitle}">${escapeHtml(label)}</h3>
      <p style="${styles.bodySmall}">${escapeHtml(value)}</p>
    </div>
  `;
}

function sectionKicker(label: string, value: string) {
  return `
    <div style="${styles.kickerRow}">
      <span style="${styles.kickerStrong}">${escapeHtml(label)}</span>
      <span style="${styles.kicker}">${escapeHtml(value)}</span>
    </div>
  `;
}

function emptyHtml(value: string) {
  return `<div style="${styles.empty}">${escapeHtml(value)}</div>`;
}

function metaLabel(startup: Startup) {
  return [startup.product_type, startup.funding_stage, startup.region].filter(Boolean).join(" / ");
}

function boolPreference(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (["true", "1", "yes", "on"].includes(value.toLowerCase())) return true;
    if (["false", "0", "no", "off"].includes(value.toLowerCase())) return false;
  }
  return fallback;
}

function cleanSource(source?: string) {
  return (source || "website").trim().slice(0, 64) || "website";
}

function normalizeSiteUrl(siteUrl?: string) {
  return (siteUrl || "https://venturedex.co").replace(/\/+$/, "");
}

function absoluteUrl(siteUrl: string, path: string) {
  return `${normalizeSiteUrl(siteUrl)}${path.startsWith("/") ? path : `/${path}`}`;
}

function parsePositiveNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function parseDateLike(value: string) {
  const hasTime = value.includes("T") || value.includes(" ");
  const normalized = hasTime ? value.replace(" ", "T") : `${value}T00:00:00`;
  const withZone = /(?:Z|[+-]\d\d:?\d\d)$/.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = new Date(withZone);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toD1DateTime(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function formatDate(value: string) {
  const parsed = parseDateLike(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: unknown) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

const styles = {
  pageBody: "margin:0;padding:0;background:#FAFAF9;color:#1A1A1A;font-family:Arial,'DM Sans',sans-serif;-webkit-font-smoothing:antialiased;",
  shell: "width:100%;background:#FAFAF9;border-collapse:collapse;",
  outerCell: "padding:32px 16px;",
  container: "width:100%;max-width:680px;border-collapse:collapse;",
  header: "padding:0 0 18px;border-bottom:1px solid #E5E5E5;",
  headerTable: "width:100%;border-collapse:collapse;",
  logo: "font-family:Georgia,'Fraunces',serif;font-size:22px;font-weight:700;line-height:1.2;color:#1A1A1A;text-decoration:none;",
  headerMeta: "font-size:12px;line-height:24px;color:#737373;",
  content: "padding:30px 0 24px;",
  h1: "margin:8px 0 14px;font-family:Georgia,'Fraunces',serif;font-size:34px;line-height:1.12;color:#1A1A1A;font-weight:600;",
  lede: "margin:0 0 16px;font-size:17px;line-height:1.65;color:#4B5563;",
  body: "margin:12px 0 0;font-size:15px;line-height:1.7;color:#1A1A1A;",
  bodySmall: "margin:8px 0 0;font-size:14px;line-height:1.65;color:#4B5563;",
  sourceText: "font-size:12px;line-height:1.5;color:#737373;",
  inlineLink: "color:#2563EB;text-decoration:underline;",
  summary: "margin:8px 0 0;font-size:16px;line-height:1.55;color:#1A1A1A;",
  metaLine: "margin:0 0 22px;font-size:12px;line-height:1.4;color:#737373;font-family:'JetBrains Mono',ui-monospace,monospace;",
  kickerRow: "margin:0 0 8px;",
  kickerStrong: "display:inline-block;margin-right:8px;font-size:12px;line-height:1.4;color:#2563EB;font-weight:700;text-transform:uppercase;letter-spacing:.04em;",
  kicker: "font-size:12px;line-height:1.4;color:#737373;text-transform:uppercase;letter-spacing:.04em;",
  card: "margin:22px 0 0;padding:20px;background:#FFFFFF;border:1px solid #E5E5E5;border-radius:8px;",
  cardTitle: "margin:4px 0 0;font-family:Georgia,'Fraunces',serif;font-size:22px;line-height:1.24;color:#1A1A1A;font-weight:600;",
  titleLink: "color:#1A1A1A;text-decoration:none;",
  badgeLine: "display:inline-block;margin:12px 0 0;padding:6px 9px;background:#F3F4F6;border-radius:4px;font-size:12px;line-height:1.3;color:#374151;",
  rule: "height:1px;background:#E5E5E5;margin:16px 0;",
  analysisBlock: "margin:14px 0 0;",
  blockTitle: "margin:0;font-size:12px;line-height:1.35;color:#737373;text-transform:uppercase;letter-spacing:.04em;font-weight:700;",
  verdict: "margin:16px 0 0;padding-left:12px;border-left:3px solid #2563EB;font-size:15px;line-height:1.65;color:#1A1A1A;",
  ctaWrap: "margin:18px 0 0;",
  cta: "display:inline-block;padding:10px 14px;background:#1A1A1A;border-radius:6px;color:#FAFAF9;text-decoration:none;font-size:14px;font-weight:700;",
  themeGrid: "margin:18px 0 8px;",
  themeBox: "margin:10px 0 0;padding:14px;background:#FFFFFF;border:1px solid #E5E5E5;border-radius:8px;",
  empty: "margin:20px 0;padding:20px;background:#FFFFFF;border:1px solid #E5E5E5;border-radius:8px;color:#737373;font-size:15px;",
  footer: "padding:18px 0 0;border-top:1px solid #E5E5E5;",
  footerText: "margin:6px 0 0;font-size:12px;line-height:1.6;color:#737373;",
  footerLink: "color:#737373;text-decoration:underline;",
};
