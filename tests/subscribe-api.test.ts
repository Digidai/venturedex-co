import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test, { beforeEach } from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { createTestD1 } from "./helpers/d1";

interface TestCloudflareEnv {
  DB: D1Database;
  EMAIL: SendEmail;
  SITE_URL: string;
  NEWSLETTER_FROM: string;
  NEWSLETTER_MAILING_ADDRESS: string;
}

const testEnv = {
  DB: createTestD1(),
  EMAIL: {} as SendEmail,
  SITE_URL: "https://venturedex.co",
  NEWSLETTER_FROM: "VentureDex <newsletter@venturedex.co>",
  NEWSLETTER_MAILING_ADDRESS: "VentureDex, 1 Test Street",
} satisfies TestCloudflareEnv;

(globalThis as typeof globalThis & { __ventureDexTestEnv: TestCloudflareEnv }).__ventureDexTestEnv = testEnv;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") {
      return {
        url: "data:text/javascript,export const env=globalThis.__ventureDexTestEnv",
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { POST } = await import("../src/pages/api/subscribe");
const { POST: POSTPreferences } = await import("../src/pages/api/newsletter/preferences");

let db: D1Database;
let sentMessages: unknown[];
let backgroundTasks: Promise<unknown>[];

beforeEach(() => {
  db = createTestD1();
  sentMessages = [];
  backgroundTasks = [];
  testEnv.DB = db;
  testEnv.EMAIL = {
    async send(message: unknown) {
      sentMessages.push(message);
      return { messageId: `confirmation-${sentMessages.length}` };
    },
  } as unknown as SendEmail;
});

function subscriptionRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): Request {
  return new Request("https://venturedex.co/api/subscribe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://venturedex.co",
      "cf-connecting-ip": "203.0.113.10",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function post(request: Request): Promise<Response> {
  return POST({
    request,
    locals: {
      cfContext: {
        waitUntil(promise: Promise<unknown>) {
          backgroundTasks.push(promise);
        },
      },
    },
  } as never);
}

function preferencesRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): Request {
  return new Request("https://venturedex.co/api/newsletter/preferences", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://venturedex.co",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function postPreferences(request: Request): Promise<Response> {
  return POSTPreferences({ request } as never);
}

async function responseBody(response: Response): Promise<unknown> {
  return response.json();
}

async function seedConfirmed(
  email: string,
  token: string,
  preferences = { daily: true, weekly: true }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO newsletter_subscriptions (
         id, email, preferences_json, status, source, unsubscribe_token, confirmed_at
       )
       VALUES (?, ?, ?, 'confirmed', 'website', ?, datetime('now'))`
    )
    .bind(`sub-${email}`, email, JSON.stringify(preferences), token)
    .run();
}

async function storedPreferences(email: string): Promise<Record<string, boolean> | null> {
  const row = await db
    .prepare("SELECT preferences_json FROM newsletter_subscriptions WHERE email = ?")
    .bind(email)
    .first<{ preferences_json: string | null }>();
  return row?.preferences_json ? JSON.parse(row.preferences_json) as Record<string, boolean> : null;
}

test("confirmed and unknown addresses receive the same public response", async () => {
  await seedConfirmed("known@example.com", "tok-known");
  const knownResponse = await post(subscriptionRequest({
    email: "known@example.com",
    preferences: { daily: false, weekly: true },
  }));
  const knownBody = await responseBody(knownResponse);

  // Use a fresh truth surface so rate-limit or subscription state from the first
  // request cannot influence the unknown-address result.
  beforeEachReset();
  const unknownResponse = await post(subscriptionRequest({
    email: "unknown@example.com",
    preferences: { daily: false, weekly: true },
  }));
  const unknownBody = await responseBody(unknownResponse);
  await Promise.all(backgroundTasks);

  assert.equal(knownResponse.status, unknownResponse.status);
  assert.deepEqual(knownBody, unknownBody);
  assert.deepEqual(knownBody, { ok: true, status: "pending" });
});

test("a public request cannot alter confirmed preferences or trigger a confirmation email", async () => {
  await seedConfirmed("protected@example.com", "tok-protected", { daily: true, weekly: false });

  const response = await post(subscriptionRequest({
    email: "protected@example.com",
    preferences: { daily: false, weekly: true },
  }));
  await Promise.all(backgroundTasks);

  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { ok: true, status: "pending" });
  assert.deepEqual(await storedPreferences("protected@example.com"), { daily: true, weekly: false });
  assert.equal(sentMessages.length, 0);
});

test("the mailbox token authorizes preference changes without changing the public response", async () => {
  await seedConfirmed("owner@example.com", "tok-owner", { daily: true, weekly: true });

  const response = await post(subscriptionRequest({
    email: "owner@example.com",
    token: "tok-owner",
    preferences: { daily: false, weekly: true },
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { ok: true, status: "pending" });
  assert.deepEqual(await storedPreferences("owner@example.com"), { daily: false, weekly: true });
});

test("missing and cross-site Origin headers are rejected before state changes", async () => {
  const missingOrigin = subscriptionRequest({ email: "missing@example.com" });
  missingOrigin.headers.delete("origin");
  const crossSite = subscriptionRequest(
    { email: "cross@example.com" },
    { origin: "https://attacker.example" }
  );

  const missingResponse = await post(missingOrigin);
  const crossResponse = await post(crossSite);

  assert.equal(missingResponse.status, 403);
  assert.equal(crossResponse.status, 403);
  const count = await db
    .prepare("SELECT COUNT(*) AS count FROM newsletter_subscriptions")
    .first<{ count: number }>();
  assert.equal(count?.count, 0);
});

test("an exhausted IP bucket short-circuits before creating an email bucket or subscription", async () => {
  await db
    .prepare(
      `INSERT INTO rate_limits (bucket, count, window_start)
       VALUES (?, 8, datetime('now'))`
    )
    .bind("confirm-ip:203.0.113.10")
    .run();

  const response = await post(subscriptionRequest({
    email: "bucket-spray@example.com",
    preferences: { daily: true, weekly: false },
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { ok: true, status: "pending" });
  assert.equal(
    await db
      .prepare("SELECT bucket FROM rate_limits WHERE bucket = ?")
      .bind("confirm-email:bucket-spray@example.com")
      .first("bucket"),
    null
  );
  assert.equal(
    await db
      .prepare("SELECT id FROM newsletter_subscriptions WHERE email = ?")
      .bind("bucket-spray@example.com")
      .first("id"),
    null
  );
  assert.equal(backgroundTasks.length, 0);
});

test("the preference API is token-bound and does not disclose subscription state", async () => {
  await seedConfirmed(
    "managed@example.com",
    "tok-managed",
    { daily: true, weekly: true }
  );
  await seedConfirmed(
    "email-only@example.com",
    "tok-email-only",
    { daily: true, weekly: false }
  );
  await seedConfirmed(
    "inactive@example.com",
    "tok-inactive",
    { daily: true, weekly: false }
  );
  await db
    .prepare(
      `UPDATE newsletter_subscriptions
       SET status = 'unsubscribed', unsubscribed_at = datetime('now')
       WHERE email = ?`
    )
    .bind("inactive@example.com")
    .run();

  const managed = await postPreferences(preferencesRequest({
    token: "tok-managed",
    preferences: { daily: false, weekly: true },
  }));
  const unknown = await postPreferences(preferencesRequest({
    token: "tok-unknown",
    preferences: { daily: false, weekly: true },
  }));
  const inactive = await postPreferences(preferencesRequest({
    token: "tok-inactive",
    preferences: { daily: false, weekly: true },
  }));
  const emailOnly = await postPreferences(preferencesRequest({
    email: "email-only@example.com",
    preferences: { daily: false, weekly: true },
  }));

  const responses = [managed, unknown, inactive, emailOnly];
  assert.ok(responses.every((response) => response.status === 200));
  assert.deepEqual(
    await Promise.all(responses.map((response) => responseBody(response))),
    [{ ok: true }, { ok: true }, { ok: true }, { ok: true }]
  );
  assert.deepEqual(
    await storedPreferences("managed@example.com"),
    { daily: false, weekly: true }
  );
  assert.deepEqual(
    await storedPreferences("inactive@example.com"),
    { daily: true, weekly: false }
  );
  assert.deepEqual(
    await storedPreferences("email-only@example.com"),
    { daily: true, weekly: false }
  );
});

test("the preference API rejects cross-site requests without changing data", async () => {
  await seedConfirmed(
    "csrf-safe@example.com",
    "tok-csrf-safe",
    { daily: true, weekly: false }
  );

  const response = await postPreferences(preferencesRequest(
    {
      token: "tok-csrf-safe",
      preferences: { daily: false, weekly: true },
    },
    { origin: "https://attacker.example" }
  ));

  assert.equal(response.status, 403);
  assert.deepEqual(
    await storedPreferences("csrf-safe@example.com"),
    { daily: true, weekly: false }
  );
});

test("the uniform subscribe result uses conditional confirmation copy", () => {
  const source = readFileSync(
    new URL("../src/pages/subscribe.astro", import.meta.url),
    "utf8"
  );
  assert.match(source, /If this address needs confirmation, a link will arrive shortly/);
  assert.doesNotMatch(source, /We sent a confirmation link to your email/);
});

function beforeEachReset(): void {
  db = createTestD1();
  sentMessages = [];
  backgroundTasks = [];
  testEnv.DB = db;
  testEnv.EMAIL = {
    async send(message: unknown) {
      sentMessages.push(message);
      return { messageId: `confirmation-${sentMessages.length}` };
    },
  } as unknown as SendEmail;
}
