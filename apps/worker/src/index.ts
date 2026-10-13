import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { getEnv } from "../../../packages/config/src";
import { db } from "../../../packages/db/src";
import { respondToVisitor } from "../../../packages/core/src/ai";
import { executeRefund } from "../../../packages/core/src/service";
const env = getEnv();
const url = new URL(env.REDIS_URL);
const connection = {
  host: url.hostname,
  port: Number(url.port || 6379),
  ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
  maxRetriesPerRequest: null,
};
const queue = new Queue("supportflow", { connection });
const publisher = new Redis(env.REDIS_URL);
let polling = false;
const worker = new Worker(
  "supportflow",
  async (job) => {
    const event = await db.outboxEvent.findUniqueOrThrow({
      where: { id: job.data.eventId as string },
    });
    const payload = event.payload as {
      messageId?: string;
      proposalId?: string;
    };
    if (event.eventType === "visitor.message" && payload.messageId)
      await respondToVisitor(
        event.id,
        event.organizationId,
        event.aggregateId,
        payload.messageId,
      );
    if (event.eventType === "refund.approved" && payload.proposalId)
      await executeRefund(payload.proposalId, event.organizationId);
    // Broadcast only identifiers. Clients re-fetch authorized data, including notes.
    await publisher.publish(
      "supportflow:events",
      JSON.stringify({
        id: event.id,
        organizationId: event.organizationId,
        aggregateId: event.aggregateId,
      }),
    );
  },
  { connection, concurrency: 4 },
);
worker.on("failed", (job, error) =>
  console.error(
    JSON.stringify({
      level: "error",
      service: "worker",
      eventId: job?.data.eventId,
      code: error.name,
    }),
  ),
);
async function poll() {
  if (polling) return;
  polling = true;
  try {
    await db.$transaction(
      async (tx) => {
        const events = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM "OutboxEvent" WHERE "publishedAt" IS NULL ORDER BY "createdAt" LIMIT 50 FOR UPDATE SKIP LOCKED`;
        for (const event of events) {
          await queue.add(
            "outbox",
            { eventId: event.id },
            {
              jobId: event.id,
              attempts: 5,
              backoff: { type: "exponential", delay: 1000 },
              removeOnComplete: false,
            },
          );
          await tx.outboxEvent.update({
            where: { id: event.id },
            data: { publishedAt: new Date() },
          });
        }
      },
      { timeout: 15000 },
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        service: "worker",
        code: "OUTBOX_POLL_FAILED",
        errorType: error instanceof Error ? error.name : "UnknownError",
        databaseCode:
          typeof error === "object" && error !== null && "code" in error
            ? String(error.code)
            : undefined,
      }),
    );
  } finally {
    polling = false;
  }
}
const timer = setInterval(() => void poll(), 1000);
void poll();
console.log(
  JSON.stringify({ service: "worker", status: "started", aiMode: "mock" }),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    clearInterval(timer);
    void (async () => {
      await worker.close();
      await queue.close();
      await publisher.quit();
      await db.$disconnect();
      process.exit(0);
    })();
  });
