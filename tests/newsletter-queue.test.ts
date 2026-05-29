import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { createTestD1 } from "./helpers/d1";
import { claimDelivery, markDeliverySent } from "../src/lib/newsletter";

let db: D1Database;

beforeEach(() => {
  db = createTestD1();
});

interface DeliveryRow {
  id: string;
  status: string;
  provider_message_id: string | null;
  sent_at: string | null;
  updated_at: string | null;
}

/**
 * Seed the minimum rows needed to exercise the delivery-claim lifecycle: a
 * confirmed subscriber, a newsletter send, and one queued delivery joining the
 * two. Returns the delivery + send ids the claim/sent helpers operate on.
 */
async function seedQueuedDelivery(database: D1Database): Promise<{ deliveryId: string; sendId: string }> {
  await database
    .prepare(
      `INSERT INTO newsletter_subscriptions (id, email, status, unsubscribe_token)
       VALUES ('sub-1', 'reader@example.com', 'confirmed', 'tok-1')`
    )
    .run();
  await database
    .prepare(
      `INSERT INTO newsletter_sends (id, send_key, newsletter_type, status)
       VALUES ('send-1', 'daily:2026-05-27', 'daily', 'sending')`
    )
    .run();
  await database
    .prepare(
      `INSERT INTO newsletter_deliveries (id, send_id, subscription_id, email, status)
       VALUES ('del-1', 'send-1', 'sub-1', 'reader@example.com', 'queued')`
    )
    .run();
  return { deliveryId: "del-1", sendId: "send-1" };
}

async function readDelivery(id: string): Promise<DeliveryRow | null> {
  return db
    .prepare("SELECT id, status, provider_message_id, sent_at, updated_at FROM newsletter_deliveries WHERE id = ?")
    .bind(id)
    .first<DeliveryRow>();
}

test("claimDelivery claims a queued row once and stamps a claim token", async () => {
  const { deliveryId, sendId } = await seedQueuedDelivery(db);

  const token = await claimDelivery(db, deliveryId, sendId);
  assert.ok(token, "first claim should succeed");
  assert.match(token ?? "", /^claim:/, "claim token should be namespaced");

  const row = await readDelivery(deliveryId);
  assert.equal(row?.provider_message_id, token, "claim token should be persisted");
  assert.equal(row?.status, "queued", "claiming does not advance status past queued");
});

test("a second concurrent claim on a fresh claim is rejected (no double send)", async () => {
  const { deliveryId, sendId } = await seedQueuedDelivery(db);

  const first = await claimDelivery(db, deliveryId, sendId);
  assert.ok(first);
  const second = await claimDelivery(db, deliveryId, sendId);
  assert.equal(second, null, "a freshly-claimed row must not be re-claimable");
});

test("a stale claim (>30 min) can be reclaimed", async () => {
  const { deliveryId, sendId } = await seedQueuedDelivery(db);

  const first = await claimDelivery(db, deliveryId, sendId);
  assert.ok(first);

  // Backdate the claim past the 30-minute reclaim window.
  await db
    .prepare("UPDATE newsletter_deliveries SET updated_at = datetime('now', '-31 minutes') WHERE id = ?")
    .bind(deliveryId)
    .run();

  const reclaim = await claimDelivery(db, deliveryId, sendId);
  assert.ok(reclaim, "a stale claim should be reclaimable");
  assert.notEqual(reclaim, first, "reclaim should mint a new token");
});

test("markDeliverySent flips the row to sent only with the matching claim token", async () => {
  const { deliveryId, sendId } = await seedQueuedDelivery(db);
  const token = await claimDelivery(db, deliveryId, sendId);
  assert.ok(token);

  await markDeliverySent(db, deliveryId, token as string, "provider-msg-123");

  const row = await readDelivery(deliveryId);
  assert.equal(row?.status, "sent");
  assert.equal(row?.provider_message_id, "provider-msg-123");
  assert.ok(row?.sent_at, "sent_at should be stamped");
});

test("markDeliverySent with a wrong claim token is a no-op", async () => {
  const { deliveryId, sendId } = await seedQueuedDelivery(db);
  const token = await claimDelivery(db, deliveryId, sendId);
  assert.ok(token);

  await markDeliverySent(db, deliveryId, "claim:not-the-real-token", "provider-msg-x");

  const row = await readDelivery(deliveryId);
  assert.equal(row?.status, "queued", "status must not advance without the right claim");
  assert.equal(row?.provider_message_id, token, "the real claim token should be untouched");
});

test("db.batch runs statements atomically and surfaces per-statement results", async () => {
  // Exercises the harness batch() path (sqlite transaction) the same way the
  // delivery enqueue does, and confirms .meta.changes is reported per statement.
  await seedQueuedDelivery(db);
  // A second subscriber so the new delivery does not collide on the
  // UNIQUE(send_id, subscription_id) constraint.
  await db
    .prepare(
      `INSERT INTO newsletter_subscriptions (id, email, status, unsubscribe_token)
       VALUES ('sub-2', 'second@example.com', 'confirmed', 'tok-2')`
    )
    .run();
  const results = await db.batch([
    db
      .prepare("INSERT INTO newsletter_deliveries (id, send_id, subscription_id, email, status) VALUES (?, 'send-1', 'sub-2', ?, 'queued')")
      .bind("del-2", "second@example.com"),
    db
      .prepare("UPDATE newsletter_deliveries SET status = 'skipped' WHERE id = ?")
      .bind("del-1"),
  ]);

  assert.equal(results.length, 2);
  assert.equal(results[0]?.meta.changes, 1, "insert should report one change");
  assert.equal(results[1]?.meta.changes, 1, "update should report one change");

  const queued = await db
    .prepare("SELECT COUNT(*) AS c FROM newsletter_deliveries WHERE status = 'queued'")
    .first<{ c: number }>();
  assert.equal(queued?.c, 1, "del-2 queued, del-1 skipped");
});
