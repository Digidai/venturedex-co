import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { createTestD1 } from "./helpers/d1";
import {
  confirmSubscription,
  isPermanentEmailServiceError,
  requireSuccessfulNewsletterCycle,
  subscribeToNewsletter,
  unsubscribeByToken,
  updateNewsletterPreferencesByToken,
  type NewsletterPreferences,
  type NewsletterSubscription,
} from "../src/lib/newsletter";

let db: D1Database;

beforeEach(() => {
  // Fresh in-memory schema per test so cases never leak state into each other.
  db = createTestD1();
});

function pauseFirstSubscriptionLookup(
  database: D1Database,
  queryFragment = "FROM newsletter_subscriptions WHERE email = ?"
): {
  db: D1Database;
  reached: Promise<void>;
  release: () => void;
} {
  let markReached!: () => void;
  let releaseLookup!: () => void;
  const reached = new Promise<void>((resolve) => {
    markReached = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseLookup = resolve;
  });
  let shouldPause = true;

  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    return new Proxy(statement, {
      get(target, property, receiver) {
        if (property === "bind") {
          return (...args: unknown[]) => wrap(target.bind(...args));
        }
        if (property === "first") {
          return async <T = unknown>(column?: string): Promise<T | null> => {
            const row = column === undefined
              ? await target.first<T>()
              : await target.first<T>(column);
            if (shouldPause) {
              shouldPause = false;
              markReached();
              await released;
            }
            return row;
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  const delayedDb = new Proxy(database, {
    get(target, property, receiver) {
      if (property === "prepare") {
        return (sql: string) => {
          const statement = target.prepare(sql);
          return sql.includes(queryFragment)
            ? wrap(statement)
            : statement;
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return { db: delayedDb, reached, release: releaseLookup };
}

function pauseAfterStatementRun(
  database: D1Database,
  queryFragment: string
): {
  db: D1Database;
  reached: Promise<void>;
  release: () => void;
} {
  let markReached!: () => void;
  let releaseRun!: () => void;
  const reached = new Promise<void>((resolve) => {
    markReached = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseRun = resolve;
  });
  let shouldPause = true;

  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    return new Proxy(statement, {
      get(target, property, receiver) {
        if (property === "bind") {
          return (...args: unknown[]) => wrap(target.bind(...args));
        }
        if (property === "run") {
          return async () => {
            const result = await target.run();
            if (shouldPause) {
              shouldPause = false;
              markReached();
              await released;
            }
            return result;
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  const delayedDb = new Proxy(database, {
    get(target, property, receiver) {
      if (property === "prepare") {
        return (sql: string) => {
          const statement = target.prepare(sql);
          return sql.includes(queryFragment) ? wrap(statement) : statement;
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return { db: delayedDb, reached, release: releaseRun };
}

/** Read a subscription row straight from the DB (bypasses lib helpers). */
async function readSubscription(email: string): Promise<NewsletterSubscription | null> {
  return db
    .prepare("SELECT * FROM newsletter_subscriptions WHERE email = ?")
    .bind(email)
    .first<NewsletterSubscription>();
}

/**
 * Seed a subscription row directly, so individual states (pending / confirmed /
 * unsubscribed, with explicit timestamps) can be set up without driving the
 * full opt-in flow. Returns the inserted row.
 */
async function seedSubscription(
  database: D1Database,
  input: {
    email: string;
    status?: "pending" | "confirmed" | "unsubscribed";
    token?: string;
    preferences?: NewsletterPreferences;
    created_at?: string;
    updated_at?: string;
    confirmed_at?: string | null;
    unsubscribed_at?: string | null;
  }
): Promise<NewsletterSubscription> {
  const id = `sub-${input.email}`;
  const status = input.status ?? "pending";
  const token = input.token ?? `tok-${input.email}`;
  const preferencesJson = JSON.stringify(input.preferences ?? { daily: true, weekly: true });
  await database
    .prepare(
      `INSERT INTO newsletter_subscriptions (
         id, email, preferences_json, status, source, unsubscribe_token,
         created_at, confirmed_at, unsubscribed_at, updated_at
       ) VALUES (?, ?, ?, ?, 'website', ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.email,
      preferencesJson,
      status,
      token,
      input.created_at ?? "2026-05-01 00:00:00",
      input.confirmed_at ?? null,
      input.unsubscribed_at ?? null,
      input.updated_at ?? input.created_at ?? "2026-05-01 00:00:00"
    )
    .run();
  const row = await readSubscription(input.email);
  assert.ok(row, "seedSubscription should insert a row");
  return row;
}

test("new email subscribes as pending with a minted token and id, confirmed_at NULL", async () => {
  const subscription = await subscribeToNewsletter(db, {
    email: "  New@Example.com ",
    preferences: { daily: true, weekly: false },
  });

  assert.equal(subscription.email, "new@example.com");
  assert.equal(subscription.status, "pending");
  assert.ok(subscription.id, "id should be minted");
  assert.ok(subscription.unsubscribe_token, "token should be minted");
  assert.equal(subscription.confirmed_at, null);
  assert.equal(subscription.unsubscribed_at, null);

  const stored = await readSubscription("new@example.com");
  assert.equal(stored?.status, "pending");
  assert.deepEqual(JSON.parse(stored?.preferences_json ?? "{}"), { daily: true, weekly: false });
});

test("confirmSubscription flips pending -> confirmed and reports newlyConfirmed", async () => {
  const seeded = await seedSubscription(db, {
    email: "reader@example.com",
    status: "pending",
    token: "tok-1",
    created_at: "2026-05-01 00:00:00",
    updated_at: "2026-05-01 00:00:00",
  });
  assert.equal(seeded.confirmed_at, null);

  // Inject a now inside the 48h window so the link is honored.
  const result = await confirmSubscription(db, "tok-1", new Date("2026-05-01T06:00:00Z"));
  assert.ok(result, "confirm should resolve for a known token");
  assert.equal(result?.newlyConfirmed, true);
  assert.equal(result?.expired, false);
  assert.equal(result?.subscription.status, "confirmed");

  const stored = await readSubscription("reader@example.com");
  assert.equal(stored?.status, "confirmed");
  assert.ok(stored?.confirmed_at, "confirmed_at should be set");
});

test("re-subscribing a confirmed address without token proof cannot change preferences", async () => {
  await seedSubscription(db, {
    email: "loyal@example.com",
    status: "confirmed",
    token: "tok-loyal",
    confirmed_at: "2026-05-02 09:00:00",
    preferences: { daily: true, weekly: true },
  });

  const result = await subscribeToNewsletter(db, {
    email: "loyal@example.com",
    preferences: { daily: false, weekly: true },
  });

  assert.equal(result.status, "confirmed");
  const stored = await readSubscription("loyal@example.com");
  assert.equal(stored?.status, "confirmed", "status must stay confirmed");
  assert.equal(stored?.confirmed_at, "2026-05-02 09:00:00", "confirmed_at must not change");
  assert.deepEqual(
    JSON.parse(stored?.preferences_json ?? "{}"),
    { daily: true, weekly: true },
    "an email address alone is not proof of ownership"
  );
});

test("a confirmed subscriber can change preferences with their emailed token", async () => {
  await seedSubscription(db, {
    email: "owner@example.com",
    status: "confirmed",
    token: "tok-owner",
    confirmed_at: "2026-05-02 09:00:00",
    preferences: { daily: true, weekly: true },
  });

  const result = await subscribeToNewsletter(db, {
    email: "owner@example.com",
    preferences: { daily: false, weekly: true },
    proofToken: "tok-owner",
  });

  assert.equal(result.status, "confirmed");
  const stored = await readSubscription("owner@example.com");
  assert.equal(stored?.status, "confirmed");
  assert.equal(stored?.confirmed_at, "2026-05-02 09:00:00");
  assert.deepEqual(JSON.parse(stored?.preferences_json ?? "{}"), { daily: false, weekly: true });
});

test("a wrong token cannot change a confirmed subscriber's preferences", async () => {
  await seedSubscription(db, {
    email: "protected@example.com",
    status: "confirmed",
    token: "tok-protected",
    confirmed_at: "2026-05-02 09:00:00",
    preferences: { daily: true, weekly: false },
  });

  await subscribeToNewsletter(db, {
    email: "protected@example.com",
    preferences: { daily: false, weekly: true },
    proofToken: "tok-attacker",
  });

  const stored = await readSubscription("protected@example.com");
  assert.deepEqual(
    JSON.parse(stored?.preferences_json ?? "{}"),
    { daily: true, weekly: false },
    "a mismatched proof token must be a no-op"
  );
});

test("a confirmation token NEVER resurrects an unsubscribed address", async () => {
  await seedSubscription(db, {
    email: "gone@example.com",
    status: "unsubscribed",
    token: "tok-gone",
    unsubscribed_at: "2026-05-03 12:00:00",
  });

  const result = await confirmSubscription(db, "tok-gone");
  assert.ok(result);
  assert.equal(result?.newlyConfirmed, false);
  assert.equal(result?.expired, false);
  assert.equal(result?.subscription.status, "unsubscribed");

  const stored = await readSubscription("gone@example.com");
  assert.equal(stored?.status, "unsubscribed", "must remain unsubscribed");
  assert.equal(stored?.confirmed_at, null, "must not gain a confirmed_at");
});

test("double-confirm is idempotent: second confirm is a no-op success", async () => {
  await seedSubscription(db, {
    email: "twice@example.com",
    status: "pending",
    token: "tok-twice",
    created_at: "2026-05-01 00:00:00",
    updated_at: "2026-05-01 00:00:00",
  });

  const now = new Date("2026-05-01T06:00:00Z"); // within the 48h window
  const first = await confirmSubscription(db, "tok-twice", now);
  assert.equal(first?.newlyConfirmed, true);
  const confirmedAt = (await readSubscription("twice@example.com"))?.confirmed_at;
  assert.ok(confirmedAt);

  // A later (still in-range relative to the now-confirmed row) second click.
  const second = await confirmSubscription(db, "tok-twice", now);
  assert.ok(second);
  assert.equal(second?.newlyConfirmed, false, "second confirm should not be newly confirmed");
  assert.equal(second?.expired, false);
  assert.equal(second?.subscription.status, "confirmed");

  const stored = await readSubscription("twice@example.com");
  assert.equal(stored?.confirmed_at, confirmedAt, "confirmed_at must be unchanged on re-confirm");
});

test("concurrent confirmations have exactly one newly-confirmed winner", async () => {
  await seedSubscription(db, {
    email: "race@example.com",
    status: "pending",
    token: "tok-race",
    created_at: "2026-05-01 00:00:00",
    updated_at: "2026-05-01 00:00:00",
  });

  const now = new Date("2026-05-01T06:00:00Z");
  const results = await Promise.all([
    confirmSubscription(db, "tok-race", now),
    confirmSubscription(db, "tok-race", now),
  ]);

  assert.equal(results.filter((result) => result?.newlyConfirmed).length, 1);
  assert.equal(results.filter((result) => result && !result.newlyConfirmed).length, 1);
  assert.ok(results.every((result) => result?.subscription.status === "confirmed"));
  assert.equal((await readSubscription("race@example.com"))?.status, "confirmed");
});

test("a confirmation winner re-checks status before reporting newly confirmed", async () => {
  await seedSubscription(db, {
    email: "confirm-unsubscribe-race@example.com",
    status: "pending",
    token: "tok-confirm-unsubscribe-race",
    created_at: "2026-05-01 00:00:00",
    updated_at: "2026-05-01 00:00:00",
  });

  const updateGate = pauseAfterStatementRun(db, "SET status = 'confirmed'");
  const delayedConfirmation = confirmSubscription(
    updateGate.db,
    "tok-confirm-unsubscribe-race",
    new Date("2026-05-01T06:00:00Z")
  );
  await updateGate.reached;

  const unsubscribe = await unsubscribeByToken(db, "tok-confirm-unsubscribe-race");
  assert.equal(unsubscribe?.status, "unsubscribed");
  updateGate.release();

  const result = await delayedConfirmation;
  assert.equal(result?.subscription.status, "unsubscribed");
  assert.equal(result?.newlyConfirmed, false);
  assert.equal((await readSubscription("confirm-unsubscribe-race@example.com"))?.status, "unsubscribed");
});

test("a delayed pending re-subscribe cannot roll a newly confirmed row back to pending", async () => {
  await seedSubscription(db, {
    email: "interleaved@example.com",
    status: "pending",
    token: "tok-interleaved",
    created_at: "2026-05-01 00:00:00",
    updated_at: "2026-05-01 00:00:00",
    preferences: { daily: true, weekly: true },
  });

  const lookupGate = pauseFirstSubscriptionLookup(db);
  const delayedSubscribe = subscribeToNewsletter(lookupGate.db, {
    email: "interleaved@example.com",
    preferences: { daily: false, weekly: true },
  });
  await lookupGate.reached;

  const confirmation = await confirmSubscription(
    db,
    "tok-interleaved",
    new Date("2026-05-01T06:00:00Z")
  );
  assert.equal(confirmation?.newlyConfirmed, true);
  const confirmedBeforeRelease = await readSubscription("interleaved@example.com");
  assert.equal(confirmedBeforeRelease?.status, "confirmed");
  assert.ok(confirmedBeforeRelease?.confirmed_at);

  lookupGate.release();
  const subscribeResult = await delayedSubscribe;
  const stored = await readSubscription("interleaved@example.com");

  assert.equal(subscribeResult.status, "confirmed");
  assert.equal(stored?.status, "confirmed");
  assert.equal(stored?.unsubscribe_token, "tok-interleaved");
  assert.equal(stored?.confirmed_at, confirmedBeforeRelease?.confirmed_at);
  assert.deepEqual(
    JSON.parse(stored?.preferences_json ?? "{}"),
    { daily: true, weekly: true },
    "a stale email-only request must preserve confirmed preferences"
  );
});

test("re-subscribing an unsubscribed address rotates its token and invalidates the old link", async () => {
  await seedSubscription(db, {
    email: "back@example.com",
    status: "unsubscribed",
    token: "tok-back",
    unsubscribed_at: "2026-05-04 08:00:00",
  });

  const result = await subscribeToNewsletter(db, {
    email: "back@example.com",
    preferences: { daily: true, weekly: false },
  });

  assert.equal(result.status, "pending");
  assert.ok(result.unsubscribe_token);
  assert.notEqual(result.unsubscribe_token, "tok-back", "the opted-out token must be rotated");
  assert.equal(await confirmSubscription(db, "tok-back"), null, "the old link must no longer resolve");

  const stored = await readSubscription("back@example.com");
  assert.equal(stored?.status, "pending");
  assert.equal(stored?.unsubscribe_token, result.unsubscribe_token);
  assert.equal(stored?.unsubscribed_at, null, "unsubscribed_at should be cleared");
  assert.equal(stored?.confirmed_at, null);
});

test("a delayed old-token unsubscribe cannot cancel a new pending lifecycle", async () => {
  await seedSubscription(db, {
    email: "unsubscribe-race@example.com",
    status: "confirmed",
    token: "tok-unsubscribe-race-old",
    confirmed_at: "2026-05-01 01:00:00",
  });

  const lookupGate = pauseFirstSubscriptionLookup(
    db,
    "FROM newsletter_subscriptions WHERE unsubscribe_token = ?"
  );
  const delayedUnsubscribe = unsubscribeByToken(
    lookupGate.db,
    "tok-unsubscribe-race-old"
  );
  await lookupGate.reached;

  assert.equal(
    (await unsubscribeByToken(db, "tok-unsubscribe-race-old"))?.status,
    "unsubscribed"
  );
  const resubscribed = await subscribeToNewsletter(db, {
    email: "unsubscribe-race@example.com",
    preferences: { daily: true, weekly: false },
  });
  assert.equal(resubscribed.status, "pending");
  assert.notEqual(resubscribed.unsubscribe_token, "tok-unsubscribe-race-old");

  lookupGate.release();
  assert.equal(await delayedUnsubscribe, null);

  const stored = await readSubscription("unsubscribe-race@example.com");
  assert.equal(stored?.status, "pending");
  assert.equal(stored?.unsubscribe_token, resubscribed.unsubscribe_token);
  assert.equal(stored?.unsubscribed_at, null);
});

test("preference updates require a confirmed bearer token", async () => {
  await seedSubscription(db, {
    email: "managed@example.com",
    status: "confirmed",
    token: "tok-managed",
    confirmed_at: "2026-05-01 01:00:00",
    preferences: { daily: true, weekly: true },
  });
  await seedSubscription(db, {
    email: "pending-managed@example.com",
    status: "pending",
    token: "tok-pending-managed",
  });
  await seedSubscription(db, {
    email: "gone-managed@example.com",
    status: "unsubscribed",
    token: "tok-gone-managed",
  });

  assert.equal(
    await updateNewsletterPreferencesByToken(
      db,
      "tok-managed",
      { daily: false, weekly: true }
    ),
    true
  );
  assert.equal(
    await updateNewsletterPreferencesByToken(
      db,
      "tok-pending-managed",
      { daily: false, weekly: true }
    ),
    false
  );
  assert.equal(
    await updateNewsletterPreferencesByToken(
      db,
      "tok-gone-managed",
      { daily: false, weekly: true }
    ),
    false
  );
  assert.equal(
    await updateNewsletterPreferencesByToken(
      db,
      "tok-unknown",
      { daily: false, weekly: true }
    ),
    false
  );

  assert.deepEqual(
    JSON.parse((await readSubscription("managed@example.com"))?.preferences_json ?? "{}"),
    { daily: false, weekly: true }
  );
  assert.deepEqual(
    JSON.parse((await readSubscription("pending-managed@example.com"))?.preferences_json ?? "{}"),
    { daily: true, weekly: true }
  );
  assert.deepEqual(
    JSON.parse((await readSubscription("gone-managed@example.com"))?.preferences_json ?? "{}"),
    { daily: true, weekly: true }
  );
});

test("a pending row older than 48h expires instead of confirming", async () => {
  // Row last (re)entered pending on May 1; "now" is 3 days later => stale link.
  await seedSubscription(db, {
    email: "stale@example.com",
    status: "pending",
    token: "tok-stale",
    created_at: "2026-05-01 00:00:00",
    updated_at: "2026-05-01 00:00:00",
  });

  const now = new Date("2026-05-04T00:00:00Z"); // 72h after the pending row
  const result = await confirmSubscription(db, "tok-stale", now);
  assert.ok(result);
  assert.equal(result?.expired, true, "stale pending link should be reported expired");
  assert.equal(result?.newlyConfirmed, false);

  const stored = await readSubscription("stale@example.com");
  assert.equal(stored?.status, "pending", "expired link must NOT confirm");
  assert.equal(stored?.confirmed_at, null);
});

test("pending tokens with missing or malformed timestamps fail closed", async () => {
  await seedSubscription(db, {
    email: "missing-time@example.com",
    status: "pending",
    token: "tok-missing-time",
  });
  await db
    .prepare(
      `UPDATE newsletter_subscriptions
       SET created_at = NULL, updated_at = NULL
       WHERE email = ?`
    )
    .bind("missing-time@example.com")
    .run();

  const missing = await confirmSubscription(
    db,
    "tok-missing-time",
    new Date("2026-05-01T06:00:00Z")
  );
  assert.equal(missing?.expired, true);
  assert.equal(missing?.newlyConfirmed, false);
  assert.equal((await readSubscription("missing-time@example.com"))?.status, "pending");

  await seedSubscription(db, {
    email: "malformed-time@example.com",
    status: "pending",
    token: "tok-malformed-time",
  });
  await db
    .prepare(
      `UPDATE newsletter_subscriptions
       SET created_at = 'not-a-timestamp', updated_at = 'also-not-a-timestamp'
       WHERE email = ?`
    )
    .bind("malformed-time@example.com")
    .run();

  const malformed = await confirmSubscription(
    db,
    "tok-malformed-time",
    new Date("2026-05-01T06:00:00Z")
  );
  assert.equal(malformed?.expired, true);
  assert.equal(malformed?.newlyConfirmed, false);
  assert.equal((await readSubscription("malformed-time@example.com"))?.status, "pending");
});

test("a pending row within the 48h window still confirms with an injected now", async () => {
  await seedSubscription(db, {
    email: "fresh@example.com",
    status: "pending",
    token: "tok-fresh",
    created_at: "2026-05-01 00:00:00",
    updated_at: "2026-05-01 00:00:00",
  });

  const now = new Date("2026-05-02T12:00:00Z"); // 36h after => still valid
  const result = await confirmSubscription(db, "tok-fresh", now);
  assert.equal(result?.expired, false);
  assert.equal(result?.newlyConfirmed, true);
  assert.equal((await readSubscription("fresh@example.com"))?.status, "confirmed");
});

test("unsubscribeByToken flips a valid token to unsubscribed and stamps unsubscribed_at", async () => {
  await seedSubscription(db, { email: "leaving@example.com", status: "confirmed", token: "tok-leave" });

  const result = await unsubscribeByToken(db, "tok-leave");
  assert.ok(result);
  assert.equal(result?.status, "unsubscribed");

  const stored = await readSubscription("leaving@example.com");
  assert.equal(stored?.status, "unsubscribed");
  assert.ok(stored?.unsubscribed_at, "unsubscribed_at should be set");
});

test("unsubscribeByToken ignores unknown and over-128-char tokens without mutating data", async () => {
  await seedSubscription(db, { email: "safe@example.com", status: "confirmed", token: "tok-safe" });

  assert.equal(await unsubscribeByToken(db, "does-not-exist"), null);
  const tooLong = "x".repeat(129);
  assert.equal(await unsubscribeByToken(db, tooLong), null);

  const stored = await readSubscription("safe@example.com");
  assert.equal(stored?.status, "confirmed", "no row should be mutated by a bad token");
  assert.equal(stored?.unsubscribed_at, null);
});

test("confirmSubscription returns null for an unknown token", async () => {
  assert.equal(await confirmSubscription(db, "nope"), null);
});

test("isPermanentEmailServiceError treats transient codes as non-permanent", () => {
  // Transient (retryable) provider codes -> not permanent.
  assert.equal(isPermanentEmailServiceError("E_RATE_LIMIT_EXCEEDED"), false);
  assert.equal(isPermanentEmailServiceError("E_INTERNAL_SERVER_ERROR"), false);
  assert.equal(isPermanentEmailServiceError("E_UNKNOWN"), false);

  // Anything else (e.g. validation / hard bounces) -> permanent.
  assert.equal(isPermanentEmailServiceError("E_INVALID_RECIPIENT"), true);
  assert.equal(isPermanentEmailServiceError("E_BLOCKED"), true);
  assert.equal(isPermanentEmailServiceError(""), true);
});

test("a returned failed newsletter result still rejects the scheduled cycle", () => {
  assert.throws(
    () => requireSuccessfulNewsletterCycle({
      ok: false,
      status: "failed",
      type: "daily",
      itemCount: 3,
      recipientCount: 2,
      error: "Queue binding unavailable",
    }),
    /Queue binding unavailable/
  );

  const successful = {
    ok: true,
    status: "sending" as const,
    type: "daily" as const,
    itemCount: 3,
    recipientCount: 2,
  };
  assert.equal(requireSuccessfulNewsletterCycle(successful), successful);
});
