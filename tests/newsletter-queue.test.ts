import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { createTestD1 } from "./helpers/d1";
import {
  claimDelivery,
  getConfirmedSubscribers,
  markDeliverySent,
  processNewsletterDeliveryQueue,
  reconcileStaleNewsletterDeliveryClaims,
  runPreparedNewsletterCycle,
  runNewsletterCycle,
  type DigestContent,
  type NewsletterEnv,
  type NewsletterQueueMessage,
} from "../src/lib/newsletter";

let db: D1Database;

beforeEach(() => {
  db = createTestD1();
});

interface DeliveryRow {
  id: string;
  status: string;
  provider_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  updated_at: string | null;
}

interface SendRow {
  id: string;
  status: string;
  error_log: string | null;
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
      `INSERT INTO newsletter_sends (
         id, send_key, newsletter_type, status, subject, preview_text,
         html_main, text_main, item_count
       )
       VALUES (
         'send-1', 'daily:2026-05-27', 'daily', 'sending', 'Daily digest',
         'Preview', '<p>Digest</p>', 'Digest', 1
       )`
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
    .prepare(
      "SELECT id, status, provider_message_id, error_message, sent_at, updated_at "
        + "FROM newsletter_deliveries WHERE id = ?"
    )
    .bind(id)
    .first<DeliveryRow>();
}

async function readSend(id: string): Promise<SendRow | null> {
  return db
    .prepare("SELECT id, status, error_log FROM newsletter_sends WHERE id = ?")
    .bind(id)
    .first<SendRow>();
}

async function readSendByKey(sendKey: string): Promise<SendRow | null> {
  return db
    .prepare("SELECT id, status, error_log FROM newsletter_sends WHERE send_key = ?")
    .bind(sendKey)
    .first<SendRow>();
}

async function seedConfirmedSubscribers(
  database: D1Database,
  count = 1
): Promise<void> {
  await database.batch(Array.from({ length: count }, (_, index) => (
    database
      .prepare(
        `INSERT INTO newsletter_subscriptions (
           id, email, status, preferences_json, unsubscribe_token
         )
         VALUES (?, ?, 'confirmed', ?, ?)`
      )
      .bind(
        `cycle-sub-${index}`,
        `cycle-reader-${index}@example.com`,
        JSON.stringify({ daily: true, weekly: true }),
        `cycle-token-${index}`
      )
  )));
}

function pauseFirstQueryAfterRead(
  database: D1Database,
  queryFragment: string
): {
  db: D1Database;
  reached: Promise<void>;
  release: () => void;
} {
  let markReached!: () => void;
  let releaseQuery!: () => void;
  const reached = new Promise<void>((resolve) => {
    markReached = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseQuery = resolve;
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
        if (property === "all") {
          return async <T = Record<string, unknown>>(): Promise<D1Result<T>> => {
            const result = await target.all<T>();
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
  return { db: delayedDb, reached, release: releaseQuery };
}

function pauseFirstStatementBeforeRun(
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
            if (shouldPause) {
              shouldPause = false;
              markReached();
              await released;
            }
            return target.run();
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

function failOnceOnSql(
  database: D1Database,
  matches: (sql: string) => boolean,
  message: string
): D1Database {
  let failed = false;
  return new Proxy(database, {
    get(target, property, receiver) {
      if (property === "prepare") {
        return (sql: string) => {
          if (!failed && matches(sql)) {
            failed = true;
            throw new Error(message);
          }
          return target.prepare(sql);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function makeQueueBatch(
  body: NewsletterQueueMessage,
  attempts = 1
): {
  batch: MessageBatch<NewsletterQueueMessage>;
  state: { acked: number; retried: number; retryDelaySeconds: number | null };
} {
  const state = {
    acked: 0,
    retried: 0,
    retryDelaySeconds: null as number | null,
  };
  const message = {
    body,
    attempts,
    ack() {
      state.acked += 1;
    },
    retry(options?: QueueRetryOptions) {
      state.retried += 1;
      state.retryDelaySeconds = options?.delaySeconds ?? null;
    },
  };
  return {
    batch: { messages: [message] } as unknown as MessageBatch<NewsletterQueueMessage>,
    state,
  };
}

function makeNewsletterEnv(
  database: D1Database,
  send: (message: unknown) => Promise<EmailSendResult>,
  queue?: Queue<NewsletterQueueMessage>
): NewsletterEnv {
  return {
    DB: database,
    EMAIL: { send } as unknown as SendEmail,
    NEWSLETTER_DELIVERY_QUEUE: queue,
    SITE_URL: "https://venturedex.co",
    NEWSLETTER_FROM: "VentureDex <newsletter@venturedex.co>",
    NEWSLETTER_MAILING_ADDRESS: "VentureDex, 1 Test Street",
  };
}

const queueMessage: NewsletterQueueMessage = {
  sendId: "send-1",
  deliveryId: "del-1",
  newsletterType: "daily",
  sendKey: "daily:2026-05-27",
};

const preparedDigest: DigestContent = {
  type: "daily",
  sendKey: "daily:race:2026-07-26",
  subject: "VentureDex Daily race fixture",
  previewText: "A deterministic send-state fixture.",
  periodStart: "2026-07-25 06:00:00",
  periodEnd: "2026-07-26 06:00:00",
  itemCount: 1,
  htmlMain: "<p>One reviewed startup.</p>",
  textMain: "One reviewed startup.",
};

test("same-key cycle ownership preserves an in-flight provider claim after partial enqueue failure", async () => {
  await seedConfirmedSubscribers(db);

  let markProviderStarted!: () => void;
  let releaseProvider!: () => void;
  const providerStarted = new Promise<void>((resolve) => {
    markProviderStarted = resolve;
  });
  const providerReleased = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });
  let providerCalls = 0;
  const provider = async (): Promise<EmailSendResult> => {
    providerCalls += 1;
    markProviderStarted();
    await providerReleased;
    return { messageId: "provider-race-accepted" };
  };

  let enqueueCalls = 0;
  let queuedBody: NewsletterQueueMessage | null = null;
  let consumerPromise: Promise<void> | null = null;
  let consumerState: ReturnType<typeof makeQueueBatch>["state"] | null = null;
  const queue = {
    async sendBatch(messages: Iterable<MessageSendRequest<NewsletterQueueMessage>>) {
      enqueueCalls += 1;
      const requests = [...messages];
      assert.equal(requests.length, 1);
      assert.equal(enqueueCalls, 1, "the losing cycle must never enqueue a duplicate batch");
      queuedBody = requests[0].body;
      const consumer = makeQueueBatch(queuedBody);
      consumerState = consumer.state;
      consumerPromise = processNewsletterDeliveryQueue(
        makeNewsletterEnv(db, provider, queue as unknown as Queue<NewsletterQueueMessage>),
        consumer.batch
      );
      await providerStarted;
      throw new Error("simulated partial sendBatch failure after Queue accepted the message");
    },
  } as unknown as Queue<NewsletterQueueMessage>;

  // Cycle A sees no row, then pauses. Cycle B creates and owns the send, and its
  // Queue message reaches claim:sending before sendBatch reports a partial
  // failure. Releasing A then exercises the stale "no existing row" decision.
  const lookupGate = pauseFirstQueryAfterRead(
    db,
    "SELECT * FROM newsletter_sends WHERE send_key = ?"
  );
  const options = {
    type: "daily" as const,
    now: new Date("2026-07-26T12:00:00Z"),
    force: true,
  };
  const cycleA = runPreparedNewsletterCycle(
    makeNewsletterEnv(lookupGate.db, provider, queue),
    options,
    preparedDigest
  );
  await lookupGate.reached;

  const cycleB = await runPreparedNewsletterCycle(
    makeNewsletterEnv(db, provider, queue),
    options,
    preparedDigest
  );
  const acceptedBody = queuedBody as NewsletterQueueMessage | null;
  const activeConsumer = consumerPromise as Promise<void> | null;
  const activeConsumerState = consumerState as ReturnType<typeof makeQueueBatch>["state"] | null;
  assert.equal(cycleB.status, "failed", "the partial enqueue call is reported to its owner");
  assert.ok(acceptedBody);
  assert.ok(activeConsumer);

  const claimedBeforeRelease = await readDelivery(acceptedBody.deliveryId);
  assert.equal(claimedBeforeRelease?.status, "queued");
  assert.match(claimedBeforeRelease?.provider_message_id ?? "", /^claim:sending:/);
  const activeClaim = claimedBeforeRelease?.provider_message_id;

  lookupGate.release();
  const staleCycle = await cycleA;
  assert.equal(staleCycle.status, "skipped");
  assert.match(staleCycle.message ?? "", /owned by another run/i);
  assert.equal(enqueueCalls, 1);

  const claimedAfterRelease = await readDelivery(acceptedBody.deliveryId);
  assert.equal(claimedAfterRelease?.status, "queued");
  assert.equal(
    claimedAfterRelease?.provider_message_id,
    activeClaim,
    "the stale cycle and enqueue cleanup must preserve the active commit token"
  );

  releaseProvider();
  await activeConsumer;

  const delivered = await readDelivery(acceptedBody.deliveryId);
  const send = await readSend(acceptedBody.sendId);
  assert.equal(providerCalls, 1, "only the original owner may call EMAIL.send");
  assert.equal(delivered?.status, "sent");
  assert.equal(delivered?.provider_message_id, "provider-race-accepted");
  assert.equal(send?.status, "sent");
  assert.equal(activeConsumerState?.acked, 1);
  assert.equal(activeConsumerState?.retried, 0);
});

test("enqueue failure cleanup preserves a pre-send claim and its evidence", async () => {
  await seedConfirmedSubscribers(db);

  let queuedBody: NewsletterQueueMessage | null = null;
  let preClaim: string | null = null;
  const queue = {
    async sendBatch(messages: Iterable<MessageSendRequest<NewsletterQueueMessage>>) {
      const requests = [...messages];
      assert.equal(requests.length, 1);
      queuedBody = requests[0].body;
      preClaim = await claimDelivery(db, queuedBody.deliveryId, queuedBody.sendId);
      assert.ok(preClaim);
      await db
        .prepare(
          `UPDATE newsletter_deliveries
           SET error_message = 'active pre-send evidence',
               updated_at = '2026-07-26 01:02:03'
           WHERE id = ? AND provider_message_id = ?`
        )
        .bind(queuedBody.deliveryId, preClaim)
        .run();
      throw new Error("simulated sendBatch failure with an active pre-send owner");
    },
  } as unknown as Queue<NewsletterQueueMessage>;

  const cycle = await runPreparedNewsletterCycle(
    makeNewsletterEnv(
      db,
      async () => {
        assert.fail("a pre-send claim does not call the provider");
      },
      queue
    ),
    {
      type: "daily",
      now: new Date("2026-07-26T12:00:00Z"),
      force: true,
    },
    preparedDigest
  );

  const acceptedBody = queuedBody as NewsletterQueueMessage | null;
  assert.equal(cycle.status, "failed");
  assert.ok(acceptedBody);
  const delivery = await readDelivery(acceptedBody.deliveryId);
  const send = await readSend(acceptedBody.sendId);
  assert.equal(delivery?.status, "queued");
  assert.equal(delivery?.provider_message_id, preClaim);
  assert.equal(delivery?.error_message, "active pre-send evidence");
  assert.equal(delivery?.updated_at, "2026-07-26 01:02:03");
  assert.equal(send?.status, "sending", "the active owner or stale-claim recovery owns the terminal state");
  assert.match(send?.error_log ?? "", /enqueue was incomplete/i);
});

test("partial enqueue failure preserves accepted and uncertain batches, failing only unattempted rows", async () => {
  await seedConfirmedSubscribers(db, 201);

  const acceptedBodies: NewsletterQueueMessage[] = [];
  const uncertainBodies: NewsletterQueueMessage[] = [];
  let enqueueCalls = 0;
  const queue = {
    async sendBatch(messages: Iterable<MessageSendRequest<NewsletterQueueMessage>>) {
      enqueueCalls += 1;
      const requests = [...messages];
      if (enqueueCalls === 1) {
        assert.equal(requests.length, 100);
        acceptedBodies.push(...requests.map((request) => request.body));
        return;
      }
      assert.equal(requests.length, 100);
      uncertainBodies.push(...requests.map((request) => request.body));
      throw new Error("simulated second-batch enqueue failure");
    },
  } as unknown as Queue<NewsletterQueueMessage>;
  let providerCalls = 0;

  const cycle = await runPreparedNewsletterCycle(
    makeNewsletterEnv(
      db,
      async () => {
        providerCalls += 1;
        return { messageId: `accepted-batch-${providerCalls}` };
      },
      queue
    ),
    {
      type: "daily",
      now: new Date("2026-07-26T12:00:00Z"),
      force: true,
    },
    { ...preparedDigest, sendKey: "daily:partial-two-batches" }
  );
  const send = await readSendByKey("daily:partial-two-batches");
  assert.equal(cycle.status, "failed");
  assert.equal(enqueueCalls, 2);
  assert.equal(acceptedBodies.length, 100);
  assert.equal(uncertainBodies.length, 100);
  assert.equal(
    send?.status,
    "sending",
    "accepted or acceptance-uncertain Queue messages still own the non-terminal send"
  );

  const beforeConsumption = await db
    .prepare(
      `SELECT status, COUNT(*) AS count
       FROM newsletter_deliveries
       WHERE send_id = ?
       GROUP BY status`
    )
    .bind(send?.id)
    .all<{ status: string; count: number }>();
  assert.deepEqual(
    Object.fromEntries(beforeConsumption.results.map((row) => [row.status, Number(row.count)])),
    { failed: 1, queued: 200 }
  );
  assert.equal((await readDelivery(acceptedBodies[0].deliveryId))?.status, "queued");
  assert.equal((await readDelivery(uncertainBodies[0].deliveryId))?.status, "queued");

  let acked = 0;
  let retried = 0;
  const acceptedBatch = {
    messages: acceptedBodies.map((body) => ({
      body,
      attempts: 1,
      ack() {
        acked += 1;
      },
      retry() {
        retried += 1;
      },
    })),
  } as unknown as MessageBatch<NewsletterQueueMessage>;
  await processNewsletterDeliveryQueue(
    makeNewsletterEnv(
      db,
      async () => {
        providerCalls += 1;
        return { messageId: `accepted-batch-${providerCalls}` };
      },
      queue
    ),
    acceptedBatch
  );

  const afterConsumption = await db
    .prepare(
      `SELECT status, COUNT(*) AS count
       FROM newsletter_deliveries
       WHERE send_id = ?
       GROUP BY status`
    )
    .bind(send?.id)
    .all<{ status: string; count: number }>();
  const finalizedSend = await readSend(send?.id ?? "");
  assert.deepEqual(
    Object.fromEntries(afterConsumption.results.map((row) => [row.status, Number(row.count)])),
    { failed: 1, queued: 100, sent: 100 }
  );
  assert.equal(providerCalls, 100);
  assert.equal(acked, 100);
  assert.equal(retried, 0);
  assert.equal(finalizedSend?.status, "sending");
  assert.match(finalizedSend?.error_log ?? "", /enqueue was incomplete/i);
});

test("a rejected sendBatch that Queue persisted remains consumable exactly once", async () => {
  await seedConfirmedSubscribers(db);

  const persistedBodies: NewsletterQueueMessage[] = [];
  const queue = {
    async sendBatch(messages: Iterable<MessageSendRequest<NewsletterQueueMessage>>) {
      persistedBodies.push(...[...messages].map((message) => message.body));
      throw new Error("client observed rejection after Queue persisted the batch");
    },
  } as unknown as Queue<NewsletterQueueMessage>;
  let providerCalls = 0;
  const env = makeNewsletterEnv(
    db,
    async () => {
      providerCalls += 1;
      return { messageId: "persisted-after-reject" };
    },
    queue
  );

  const cycle = await runPreparedNewsletterCycle(
    env,
    { type: "daily" },
    { ...preparedDigest, sendKey: "daily:queue-persisted-before-reject" }
  );
  assert.equal(cycle.status, "failed");
  assert.equal(persistedBodies.length, 1);

  const body = persistedBodies[0];
  const deliveryBeforeConsumption = await readDelivery(body.deliveryId);
  const sendBeforeConsumption = await readSend(body.sendId);
  assert.equal(deliveryBeforeConsumption?.status, "queued");
  assert.equal(deliveryBeforeConsumption?.provider_message_id, null);
  assert.equal(sendBeforeConsumption?.status, "sending");

  const consumer = makeQueueBatch(body);
  await processNewsletterDeliveryQueue(env, consumer.batch);

  const deliveryAfterConsumption = await readDelivery(body.deliveryId);
  const sendAfterConsumption = await readSend(body.sendId);
  assert.equal(providerCalls, 1);
  assert.equal(consumer.state.acked, 1);
  assert.equal(consumer.state.retried, 0);
  assert.equal(deliveryAfterConsumption?.status, "sent");
  assert.equal(deliveryAfterConsumption?.provider_message_id, "persisted-after-reject");
  assert.equal(sendAfterConsumption?.status, "sent");
});

test("a truly rejected batch is re-enqueued by stale Cron ownership and duplicate claims cannot double-send", async () => {
  await seedConfirmedSubscribers(db);

  const rejectingQueue = {
    async sendBatch(_messages: Iterable<MessageSendRequest<NewsletterQueueMessage>>) {
      throw new Error("Queue rejected before persistence");
    },
  } as unknown as Queue<NewsletterQueueMessage>;
  const digest = { ...preparedDigest, sendKey: "daily:truly-rejected-recovery" };
  const firstCycle = await runPreparedNewsletterCycle(
    makeNewsletterEnv(
      db,
      async () => {
        assert.fail("the truly rejected batch has no consumer");
      },
      rejectingQueue
    ),
    { type: "daily" },
    digest
  );
  const staleSend = await readSendByKey(digest.sendKey);
  assert.equal(firstCycle.status, "failed");
  assert.equal(staleSend?.status, "sending");
  assert.ok(staleSend?.id);

  await db
    .prepare(
      `UPDATE newsletter_sends
       SET updated_at = datetime('now', '-31 minutes')
       WHERE id = ?`
    )
    .bind(staleSend.id)
    .run();
  await db
    .prepare(
      `UPDATE newsletter_deliveries
       SET updated_at = datetime('now', '-31 minutes')
       WHERE send_id = ?`
    )
    .bind(staleSend.id)
    .run();

  const requeuedBodies: NewsletterQueueMessage[] = [];
  const recoveryQueue = {
    async sendBatch(messages: Iterable<MessageSendRequest<NewsletterQueueMessage>>) {
      requeuedBodies.push(...[...messages].map((message) => message.body));
    },
  } as unknown as Queue<NewsletterQueueMessage>;
  let markProviderStarted!: () => void;
  let releaseProvider!: () => void;
  const providerStarted = new Promise<void>((resolve) => {
    markProviderStarted = resolve;
  });
  const providerReleased = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });
  let providerCalls = 0;
  const recoveryEnv = makeNewsletterEnv(
    db,
    async () => {
      providerCalls += 1;
      markProviderStarted();
      await providerReleased;
      return { messageId: "recovered-queue-message" };
    },
    recoveryQueue
  );

  const recoveryCycle = await runPreparedNewsletterCycle(
    recoveryEnv,
    { type: "daily" },
    digest
  );
  assert.equal(recoveryCycle.status, "sending");
  assert.equal(requeuedBodies.length, 1);
  assert.equal(requeuedBodies[0].sendId, staleSend.id);

  const winner = makeQueueBatch(requeuedBodies[0]);
  const duplicate = makeQueueBatch(requeuedBodies[0]);
  const winnerPromise = processNewsletterDeliveryQueue(recoveryEnv, winner.batch);
  await providerStarted;
  await processNewsletterDeliveryQueue(recoveryEnv, duplicate.batch);
  assert.equal(duplicate.state.acked, 0);
  assert.equal(duplicate.state.retried, 1);
  assert.equal(providerCalls, 1);

  releaseProvider();
  await winnerPromise;

  const delivery = await readDelivery(requeuedBodies[0].deliveryId);
  const send = await readSend(staleSend.id);
  assert.equal(winner.state.acked, 1);
  assert.equal(winner.state.retried, 0);
  assert.equal(providerCalls, 1);
  assert.equal(delivery?.status, "sent");
  assert.equal(send?.status, "sent");
});

test("an ensureDeliveries failure releases send ownership for the next cycle", async () => {
  await seedConfirmedSubscribers(db);
  const faultingDb = failOnceOnSql(
    db,
    (sql) => sql.includes("INSERT INTO newsletter_deliveries"),
    "transient ensureDeliveries failure"
  );
  const queuedBodies: NewsletterQueueMessage[] = [];
  const queue = {
    async sendBatch(messages: Iterable<MessageSendRequest<NewsletterQueueMessage>>) {
      for (const message of messages) queuedBodies.push(message.body);
    },
  } as unknown as Queue<NewsletterQueueMessage>;
  const env = makeNewsletterEnv(
    faultingDb,
    async () => ({ messageId: "not-called" }),
    queue
  );

  const first = await runPreparedNewsletterCycle(
    env,
    { type: "daily" },
    { ...preparedDigest, sendKey: "daily:ensure-recovery" }
  );
  const failedSend = await readSendByKey("daily:ensure-recovery");
  assert.equal(first.status, "failed");
  assert.equal(failedSend?.status, "failed");
  assert.match(failedSend?.error_log ?? "", /ensureDeliveries failure/);

  const second = await runPreparedNewsletterCycle(
    makeNewsletterEnv(
      db,
      async () => ({ messageId: "not-called" }),
      queue
    ),
    { type: "daily" },
    { ...preparedDigest, sendKey: "daily:ensure-recovery" }
  );
  assert.equal(second.status, "sending");
  assert.equal(queuedBodies.length, 1, "the next cycle must reacquire and enqueue the recoverable send");
});

test("a stale sending row with unclaimed deliveries is safely re-enqueued", async () => {
  await seedConfirmedSubscribers(db);
  await db
    .prepare(
      `INSERT INTO newsletter_sends (
         id, send_key, newsletter_type, status, subject, preview_text,
         html_main, text_main, period_start, period_end, item_count,
         recipient_count, provider, updated_at
       )
       VALUES (
         'stale-send', 'daily:stale-unclaimed', 'daily', 'sending', ?, ?, ?, ?, ?, ?,
         1, 1, 'cloudflare_email_service', datetime('now', '-31 minutes')
       )`
    )
    .bind(
      preparedDigest.subject,
      preparedDigest.previewText,
      preparedDigest.htmlMain,
      preparedDigest.textMain,
      preparedDigest.periodStart,
      preparedDigest.periodEnd
    )
    .run();
  await db
    .prepare(
      `INSERT INTO newsletter_deliveries (
         id, send_id, subscription_id, email, status, updated_at
       )
       VALUES (
         'stale-delivery', 'stale-send', 'cycle-sub-0',
         'cycle-reader-0@example.com', 'queued', datetime('now', '-31 minutes')
       )`
    )
    .run();

  const queuedBodies: NewsletterQueueMessage[] = [];
  const queue = {
    async sendBatch(messages: Iterable<MessageSendRequest<NewsletterQueueMessage>>) {
      for (const message of messages) queuedBodies.push(message.body);
    },
  } as unknown as Queue<NewsletterQueueMessage>;
  const cycle = await runPreparedNewsletterCycle(
    makeNewsletterEnv(
      db,
      async () => ({ messageId: "not-called" }),
      queue
    ),
    { type: "daily" },
    { ...preparedDigest, sendKey: "daily:stale-unclaimed" }
  );

  assert.equal(cycle.status, "sending");
  assert.equal(queuedBodies.length, 1);
  assert.equal(queuedBodies[0]?.deliveryId, "stale-delivery");
});

test("concurrent cycle subscriber snapshots use only the token persisted in D1", async () => {
  await db
    .prepare(
      `INSERT INTO newsletter_subscriptions (
         id, email, status, preferences_json, unsubscribe_token
       )
       VALUES (
         'missing-token-sub', 'missing-token@example.com', 'confirmed', ?, NULL
       )`
    )
    .bind(JSON.stringify({ daily: true, weekly: true }))
    .run();

  const lookupGate = pauseFirstQueryAfterRead(
    db,
    "SELECT * FROM newsletter_subscriptions"
  );
  const firstSnapshotPromise = getConfirmedSubscribers(lookupGate.db);
  await lookupGate.reached;
  const secondSnapshot = await getConfirmedSubscribers(db);
  lookupGate.release();
  const firstSnapshot = await firstSnapshotPromise;
  const stored = await db
    .prepare(
      `SELECT unsubscribe_token
       FROM newsletter_subscriptions
       WHERE id = 'missing-token-sub'`
    )
    .first<{ unsubscribe_token: string | null }>();

  assert.ok(stored?.unsubscribe_token);
  assert.equal(firstSnapshot[0]?.unsubscribe_token, stored.unsubscribe_token);
  assert.equal(secondSnapshot[0]?.unsubscribe_token, stored.unsubscribe_token);
});

test("a stale skip owner cannot overwrite a reclaimed active claim", async () => {
  await seedQueuedDelivery(db);
  await db
    .prepare(
      `UPDATE newsletter_subscriptions
       SET status = 'unsubscribed'
       WHERE id = 'sub-1'`
    )
    .run();

  const contextGate = pauseFirstQueryAfterRead(db, "FROM newsletter_deliveries d");
  const first = makeQueueBatch(queueMessage);
  const staleOwner = processNewsletterDeliveryQueue(
    makeNewsletterEnv(
      contextGate.db,
      async () => {
        assert.fail("an ineligible subscriber must not reach the provider");
      }
    ),
    first.batch
  );
  await contextGate.reached;

  await db
    .prepare(
      `UPDATE newsletter_deliveries
       SET updated_at = datetime('now', '-31 minutes')
       WHERE id = 'del-1'`
    )
    .run();
  const reclaimed = await claimDelivery(db, "del-1", "send-1");
  assert.ok(reclaimed);

  contextGate.release();
  await staleOwner;
  const delivery = await readDelivery("del-1");
  const send = await readSend("send-1");
  assert.equal(first.state.acked, 0);
  assert.equal(first.state.retried, 1);
  assert.equal(delivery?.status, "queued");
  assert.equal(delivery?.provider_message_id, reclaimed);
  assert.equal(send?.status, "sending");
});

test("a stale empty cycle cannot downgrade a winning sent row to skipped", async () => {
  await seedConfirmedSubscribers(db);
  const sendKey = "daily:stale-empty";
  const emptyDigest: DigestContent = {
    ...preparedDigest,
    sendKey,
    itemCount: 0,
    htmlMain: "",
    textMain: "",
  };
  const skippedGate = pauseFirstStatementBeforeRun(
    db,
    "VALUES (?, ?, ?, 'skipped'"
  );
  const staleEmptyCycle = runPreparedNewsletterCycle(
    makeNewsletterEnv(
      skippedGate.db,
      async () => ({ messageId: "not-called" })
    ),
    { type: "daily" },
    emptyDigest
  );
  await skippedGate.reached;

  const queuedBodies: NewsletterQueueMessage[] = [];
  const queue = {
    async sendBatch(messages: Iterable<MessageSendRequest<NewsletterQueueMessage>>) {
      for (const message of messages) queuedBodies.push(message.body);
    },
  } as unknown as Queue<NewsletterQueueMessage>;
  const winner = await runPreparedNewsletterCycle(
    makeNewsletterEnv(
      db,
      async () => ({ messageId: "winner-provider-id" }),
      queue
    ),
    { type: "daily" },
    { ...preparedDigest, sendKey }
  );
  assert.equal(winner.status, "sending");
  assert.equal(queuedBodies.length, 1);
  const delivery = makeQueueBatch(queuedBodies[0] as NewsletterQueueMessage);
  await processNewsletterDeliveryQueue(
    makeNewsletterEnv(
      db,
      async () => ({ messageId: "winner-provider-id" }),
      queue
    ),
    delivery.batch
  );
  assert.equal((await readSendByKey(sendKey))?.status, "sent");

  skippedGate.release();
  assert.equal((await staleEmptyCycle).status, "skipped");
  assert.equal((await readSendByKey(sendKey))?.status, "sent");
});

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

test("a stale provider-send claim is never reclaimed because acceptance is uncertain", async () => {
  const { deliveryId, sendId } = await seedQueuedDelivery(db);
  await db
    .prepare(
      `UPDATE newsletter_deliveries
       SET provider_message_id = 'claim:sending:previous-attempt',
           updated_at = datetime('now', '-31 minutes')
       WHERE id = ?`
    )
    .bind(deliveryId)
    .run();

  const reclaim = await claimDelivery(db, deliveryId, sendId);
  assert.equal(reclaim, null, "an uncertain provider call must be reconciled, never sent twice");
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

test("a transient context read failure releases the claim before queue retry", async () => {
  await seedQueuedDelivery(db);
  const faultingDb = failOnceOnSql(
    db,
    (sql) => sql.includes("FROM newsletter_deliveries d"),
    "transient context read failure"
  );
  const { batch, state } = makeQueueBatch(queueMessage);
  let sends = 0;

  await processNewsletterDeliveryQueue(
    makeNewsletterEnv(faultingDb, async () => {
      sends += 1;
      return { messageId: "provider-never-called" };
    }),
    batch
  );

  const row = await readDelivery("del-1");
  assert.equal(sends, 0, "the provider must not be called without delivery context");
  assert.equal(state.acked, 0);
  assert.equal(state.retried, 1, "transient pre-send failures should retry");
  assert.equal(row?.status, "queued");
  assert.equal(row?.provider_message_id, null, "the failed attempt must not strand its claim");
  assert.match(row?.error_message ?? "", /transient context read failure/);
});

test("an ambiguous provider failure becomes terminal reconciliation without resend", async () => {
  await seedQueuedDelivery(db);
  const { batch, state } = makeQueueBatch(queueMessage);
  let sends = 0;

  await processNewsletterDeliveryQueue(
    makeNewsletterEnv(db, async () => {
      sends += 1;
      throw Object.assign(new Error("provider temporarily unavailable"), {
        code: "E_INTERNAL_SERVER_ERROR",
      });
    }),
    batch
  );

  const row = await readDelivery("del-1");
  assert.equal(sends, 1);
  assert.equal(state.acked, 1);
  assert.equal(state.retried, 0, "an uncertain provider outcome must not be resent");
  assert.equal(row?.status, "failed");
  assert.match(row?.provider_message_id ?? "", /^claim:sending:/);
  assert.match(row?.error_message ?? "", /outcome is uncertain/i);
});

test("a later non-force Cron cycle never rebuilds an ambiguous provider outcome", async () => {
  await seedQueuedDelivery(db);
  const periodStart = "2026-07-25 06:00:00";
  const periodEnd = "2026-07-26 06:00:00";
  const sendKey = `daily:${periodStart}:${periodEnd}`;
  await db
    .prepare(
      `UPDATE newsletter_sends
       SET send_key = ?, period_start = ?, period_end = ?
       WHERE id = 'send-1'`
    )
    .bind(sendKey, periodStart, periodEnd)
    .run();

  let sends = 0;
  const provider = async (): Promise<EmailSendResult> => {
    sends += 1;
    throw Object.assign(new Error("provider temporarily unavailable"), {
      code: "E_INTERNAL_SERVER_ERROR",
    });
  };
  const first = makeQueueBatch({ ...queueMessage, sendKey });
  await processNewsletterDeliveryQueue(makeNewsletterEnv(db, provider), first.batch);
  assert.equal(sends, 1);

  const queuedBodies: NewsletterQueueMessage[] = [];
  const queue = {
    async sendBatch(messages: Iterable<MessageSendRequest<NewsletterQueueMessage>>) {
      for (const message of messages) queuedBodies.push(message.body);
    },
  } as unknown as Queue<NewsletterQueueMessage>;
  const cycle = await runNewsletterCycle(
    makeNewsletterEnv(db, provider, queue),
    { type: "daily", now: new Date("2026-07-26T12:00:00Z") }
  );

  for (const body of queuedBodies) {
    const replay = makeQueueBatch(body, 1);
    await processNewsletterDeliveryQueue(makeNewsletterEnv(db, provider, queue), replay.batch);
  }

  assert.equal(cycle.status, "skipped");
  assert.equal(queuedBodies.length, 0, "terminal provider evidence must never be requeued by Cron");
  assert.equal(sends, 1, "the uncertain provider call must never be issued a second time");
});

test("an explicit provider rate-limit rejection releases its claim for retry", async () => {
  await seedQueuedDelivery(db);
  const { batch, state } = makeQueueBatch(queueMessage);

  await processNewsletterDeliveryQueue(
    makeNewsletterEnv(db, async () => {
      throw Object.assign(new Error("rate limit exceeded"), {
        code: "E_RATE_LIMIT_EXCEEDED",
      });
    }),
    batch
  );

  const row = await readDelivery("del-1");
  assert.equal(state.acked, 0);
  assert.equal(state.retried, 1);
  assert.equal(row?.status, "queued");
  assert.equal(row?.provider_message_id, null, "a definitive rejection is safe to retry");
  assert.match(row?.error_message ?? "", /rate limit exceeded/);
});

test("a permanent content rebuild failure releases the claim before terminal failure", async () => {
  await seedQueuedDelivery(db);
  await db
    .prepare("UPDATE newsletter_sends SET html_main = '' WHERE id = 'send-1'")
    .run();
  const { batch, state } = makeQueueBatch(queueMessage);

  await processNewsletterDeliveryQueue(
    makeNewsletterEnv(db, async () => {
      assert.fail("invalid digest content must not reach the provider");
    }),
    batch
  );

  const row = await readDelivery("del-1");
  assert.equal(state.acked, 1);
  assert.equal(state.retried, 0);
  assert.equal(row?.status, "failed");
  assert.equal(row?.provider_message_id, null);
  assert.match(row?.error_message ?? "", /Could not rebuild digest/);
});

test("an existing fresh claim is retried instead of silently acknowledged", async () => {
  const { deliveryId, sendId } = await seedQueuedDelivery(db);
  assert.ok(await claimDelivery(db, deliveryId, sendId));
  const { batch, state } = makeQueueBatch(queueMessage);

  await processNewsletterDeliveryQueue(
    makeNewsletterEnv(db, async () => {
      assert.fail("a concurrent claimant must not send");
    }),
    batch
  );

  assert.equal(state.acked, 0, "an in-flight delivery is not complete");
  assert.equal(state.retried, 1, "the queue must revisit an in-flight delivery");
});

test("the final duplicate attempt cannot fail another active provider-send claim", async () => {
  await seedQueuedDelivery(db);
  await db
    .prepare(
      `UPDATE newsletter_deliveries
       SET provider_message_id = 'claim:sending:other-live-attempt',
           updated_at = datetime('now')
       WHERE id = 'del-1'`
    )
    .run();
  const { batch, state } = makeQueueBatch(queueMessage, 5);

  await processNewsletterDeliveryQueue(
    makeNewsletterEnv(db, async () => {
      assert.fail("a duplicate message must not call the provider");
    }),
    batch
  );

  const row = await readDelivery("del-1");
  assert.equal(state.acked, 0);
  assert.equal(state.retried, 1, "Queue/DLQ policy owns the duplicate attempt limit");
  assert.equal(row?.status, "queued");
  assert.equal(
    row?.provider_message_id,
    "claim:sending:other-live-attempt",
    "the active owner must retain its conditional commit token"
  );
});

test("stale provider-send claims become failed without automatic resend", async () => {
  await seedQueuedDelivery(db);
  await db
    .prepare(
      `UPDATE newsletter_deliveries
       SET provider_message_id = 'claim:sending:crashed-owner',
           updated_at = datetime('now', '-31 minutes')
       WHERE id = 'del-1'`
    )
    .run();

  const reconciled = await reconcileStaleNewsletterDeliveryClaims(db);
  const row = await readDelivery("del-1");
  const send = await db
    .prepare("SELECT status FROM newsletter_sends WHERE id = 'send-1'")
    .first<{ status: string }>();

  assert.equal(reconciled, 1);
  assert.equal(row?.status, "failed");
  assert.equal(row?.provider_message_id, "claim:sending:crashed-owner");
  assert.match(row?.error_message ?? "", /automatic resend is disabled/i);
  assert.equal(send?.status, "failed");
});

test("Cron reconciliation of a stale provider-send claim does not rebuild it", async () => {
  await seedQueuedDelivery(db);
  const periodStart = "2026-07-25 06:00:00";
  const periodEnd = "2026-07-26 06:00:00";
  await db
    .prepare(
      `UPDATE newsletter_sends
       SET send_key = ?, period_start = ?, period_end = ?
       WHERE id = 'send-1'`
    )
    .bind(`daily:${periodStart}:${periodEnd}`, periodStart, periodEnd)
    .run();
  await db
    .prepare(
      `UPDATE newsletter_deliveries
       SET provider_message_id = 'claim:sending:crashed-owner',
           updated_at = datetime('now', '-31 minutes')
       WHERE id = 'del-1'`
    )
    .run();

  let sends = 0;
  const queuedBodies: NewsletterQueueMessage[] = [];
  const queue = {
    async sendBatch(messages: Iterable<MessageSendRequest<NewsletterQueueMessage>>) {
      for (const message of messages) queuedBodies.push(message.body);
    },
  } as unknown as Queue<NewsletterQueueMessage>;
  const cycle = await runNewsletterCycle(
    makeNewsletterEnv(
      db,
      async () => {
        sends += 1;
        return { messageId: "must-not-send" };
      },
      queue
    ),
    { type: "daily", now: new Date("2026-07-26T12:00:00Z") }
  );

  assert.equal(cycle.status, "skipped");
  assert.equal(queuedBodies.length, 0);
  assert.equal(sends, 0, "stale provider-send reconciliation is terminal for automatic delivery");
});

test("a post-provider commit failure is terminal and never schedules a duplicate send", async () => {
  await seedQueuedDelivery(db);
  const faultingDb = failOnceOnSql(
    db,
    (sql) => sql.includes("SET status = 'sent'"),
    "transient sent-state commit failure"
  );
  const { batch, state } = makeQueueBatch(queueMessage);
  let sends = 0;

  await processNewsletterDeliveryQueue(
    makeNewsletterEnv(faultingDb, async () => {
      sends += 1;
      return { messageId: "provider-accepted-1" };
    }),
    batch
  );

  const row = await readDelivery("del-1");
  assert.equal(sends, 1, "the provider accepted exactly one message");
  assert.equal(state.retried, 0, "an accepted message must not be sent again");
  assert.equal(state.acked, 1);
  assert.equal(row?.status, "failed", "the uncertain persistence state is terminal for reconciliation");
  assert.equal(
    row?.provider_message_id,
    "provider-accepted-1",
    "reconciliation evidence must retain the accepted provider message id"
  );
  assert.match(row?.error_message ?? "", /accepted.*commit/i);

  const replay = makeQueueBatch(queueMessage, 2);
  await processNewsletterDeliveryQueue(
    makeNewsletterEnv(faultingDb, async () => {
      sends += 1;
      return { messageId: "provider-must-not-accept-2" };
    }),
    replay.batch
  );
  assert.equal(sends, 1, "a redelivered Queue message must not duplicate an accepted email");
  assert.equal(replay.state.acked, 1);
  assert.equal(replay.state.retried, 0);
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
