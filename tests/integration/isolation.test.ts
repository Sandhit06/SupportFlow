import "dotenv/config";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { db } from "../../packages/db/src";
import {
  conversationFor,
  member,
  sendMessage,
  decideProposal,
  executeRefund,
} from "../../packages/core/src/service";
import { respondToVisitor } from "../../packages/core/src/ai";
import { redis } from "../../packages/core/src/rate-limit";
import { bootstrapVisitor } from "../../packages/core/src/visitor-session";
import { verifyToken } from "../../packages/core/src/tokens";
import type { Actor } from "../../packages/contracts/src";
const ids: { orgs: string[]; users: string[] } = { orgs: [], users: [] };
let actor: Actor,
  other: Actor,
  conversationId: string,
  visitorId: string,
  proposalId: string;
beforeAll(async () => {
  await redis().ping();
  for (let i = 0; i < 2; i++) {
    const org = await db.organization.create({
      data: {
        slug: `test-${crypto.randomUUID()}`,
        name: "Integration fixture",
      },
    });
    ids.orgs.push(org.id);
    const user = await db.user.create({
      data: {
        email: `${crypto.randomUUID()}@test.invalid`,
        name: "Test owner",
        passwordHash: "not-a-login-account",
      },
    });
    ids.users.push(user.id);
    await db.membership.create({
      data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
  }
  actor = await member(ids.users[0], ids.orgs[0]);
  other = await member(ids.users[1], ids.orgs[1]);
  const visitor = await db.visitor.create({
    data: { organizationId: actor.organizationId },
  });
  visitorId = visitor.id;
  const c = await db.conversation.create({
    data: {
      organizationId: actor.organizationId,
      visitorId,
      subject: "Isolation test",
    },
  });
  conversationId = c.id;
  await db.externalOrder.create({
    data: {
      organizationId: actor.organizationId,
      visitorId,
      orderNumber: "ORD-1003",
      status: "SHIPPED",
      estimatedDelivery: "Tomorrow",
      amountCents: 4900,
    },
  });
  const p = await db.actionProposal.create({
    data: {
      organizationId: actor.organizationId,
      conversationId,
      orderNumber: "ORD-1003",
      amountCents: 4900,
      reason: "Fixture",
      requestedBy: visitorId,
      expiresAt: new Date(Date.now() + 60000),
      idempotencyKey: crypto.randomUUID(),
    },
  });
  proposalId = p.id;
});
afterAll(async () => {
  if (!ids.orgs.length) {
    await db.$disconnect();
    redis().disconnect();
    return;
  }
  await db.simulatedRefund.deleteMany({
    where: { organizationId: { in: ids.orgs } },
  });
  await db.auditEvent.deleteMany({
    where: { organizationId: { in: ids.orgs } },
  });
  await db.outboxEvent.deleteMany({
    where: { organizationId: { in: ids.orgs } },
  });
  await db.organization.deleteMany({ where: { id: { in: ids.orgs } } });
  await db.user.deleteMany({ where: { id: { in: ids.users } } });
  await db.$disconnect();
  await redis().quit();
});
describe("real PostgreSQL tenant and transaction boundaries", () => {
  it("rotates hashed visitor refresh credentials and rejects replay or other installations", async () => {
    const key = `pub_test_${crypto.randomUUID()}`;
    await db.widgetInstallation.create({
      data: {
        organizationId: actor.organizationId,
        publicKey: key,
        allowedOrigins: ["https://store.example.test"],
      },
    });
    const first = await bootstrapVisitor(key, "https://store.example.test");
    const second = await bootstrapVisitor(
      key,
      "https://store.example.test",
      first.refreshToken,
    );
    expect(second.visitorId).toBe(first.visitorId);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(
      bootstrapVisitor(key, "https://store.example.test", first.refreshToken),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      bootstrapVisitor(key, "https://evil.example.test", second.refreshToken),
    ).rejects.toMatchObject({ status: 403 });
    const claims = await verifyToken(second.visitorToken);
    expect(claims.kind).toBe("visitor");
    await db.visitorSession.updateMany({
      where: { visitorId: first.visitorId },
      data: { revoked: true },
    });
    await expect(verifyToken(second.visitorToken)).rejects.toMatchObject({
      status: 401,
    });
  });
  it("refuses membership derived from an arbitrary organization", async () => {
    await expect(
      member(actor.userId, other.organizationId),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("refuses cross-tenant guessed conversation IDs", async () => {
    await expect(conversationFor(other, conversationId)).rejects.toMatchObject({
      status: 404,
    });
  });
  it("enforces composite foreign keys against tenant mismatch", async () => {
    await expect(
      db.message.create({
        data: {
          organizationId: other.organizationId,
          conversationId,
          senderType: "AGENT",
          body: "forged",
          clientMessageId: crypto.randomUUID(),
        },
      }),
    ).rejects.toThrow();
  });
  it("saves one message and outbox event on concurrent duplicate sends", async () => {
    const clientMessageId = crypto.randomUUID();
    await Promise.all(
      Array.from({ length: 5 }, () =>
        sendMessage(actor, conversationId, {
          body: "hello",
          clientMessageId,
          internal: false,
        }),
      ),
    );
    expect(
      await db.message.count({ where: { conversationId, clientMessageId } }),
    ).toBe(1);
    expect(
      await db.outboxEvent.count({
        where: { aggregateId: conversationId, eventType: "message.created" },
      }),
    ).toBe(1);
  });
  it("refuses cross-visitor order access in mock AI", async () => {
    const visitor = await db.visitor.create({
      data: { organizationId: actor.organizationId },
    });
    const c = await db.conversation.create({
      data: {
        organizationId: actor.organizationId,
        visitorId: visitor.id,
        subject: "Other visitor",
      },
    });
    const message = await sendMessage(
      { organizationId: actor.organizationId, visitorId: visitor.id },
      c.id,
      {
        body: "Where is ORD-1003?",
        clientMessageId: crypto.randomUUID(),
        internal: false,
      },
    );
    await respondToVisitor(
      crypto.randomUUID(),
      actor.organizationId,
      c.id,
      message.id,
    );
    const answer = await db.message.findFirst({
      where: { conversationId: c.id, senderType: "AI" },
    });
    expect(answer?.body).toContain("couldn’t verify");
  });
  it("cannot execute a pending or cross-tenant proposal", async () => {
    await expect(
      executeRefund(proposalId, actor.organizationId),
    ).rejects.toMatchObject({ code: "NOT_APPROVED" });
    await expect(decideProposal(other, proposalId, true)).rejects.toMatchObject(
      { status: 404 },
    );
  });
  it("concurrent approvals transition once and duplicate execution has one effect", async () => {
    const results = await Promise.allSettled([
      decideProposal(actor, proposalId, true),
      decideProposal(actor, proposalId, true),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await Promise.all([
      executeRefund(proposalId, actor.organizationId),
      executeRefund(proposalId, actor.organizationId),
    ]);
    expect(await db.simulatedRefund.count({ where: { proposalId } })).toBe(1);
    expect(
      (await db.actionProposal.findUnique({ where: { id: proposalId } }))
        ?.state,
    ).toBe("EXECUTED");
  });
});
