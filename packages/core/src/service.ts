import { db } from "../../db/src";
import type { Actor } from "../../contracts/src";
import { requireCapability, DomainError, assertPending } from "./policy";
import type { Prisma } from "@prisma/client";

export async function member(
  userId: string,
  organizationId: string,
): Promise<Actor> {
  const membership = await db.membership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
  if (!membership)
    throw new DomainError("NOT_FOUND", 404, "Workspace not found.");
  return { userId, organizationId, role: membership.role };
}
export async function conversationFor(
  actor: { organizationId: string; visitorId?: string },
  id: string,
) {
  const conversation = await db.conversation.findFirst({
    where: {
      id,
      organizationId: actor.organizationId,
      ...(actor.visitorId ? { visitorId: actor.visitorId } : {}),
    },
    include: { visitor: true },
  });
  if (!conversation)
    throw new DomainError("NOT_FOUND", 404, "Conversation not found.");
  return conversation;
}
export async function workspace(actor: Actor) {
  const scope = { organizationId: actor.organizationId };
  const [
    organization,
    conversations,
    articles,
    tickets,
    proposals,
    members,
    installations,
    audit,
  ] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: actor.organizationId } }),
    db.conversation.findMany({
      where: scope,
      orderBy: { lastMessageAt: "desc" },
      take: 100,
      include: {
        visitor: { select: { name: true } },
        messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100 },
      },
    }),
    db.knowledgeArticle.findMany({
      where: scope,
      orderBy: { updatedAt: "desc" },
    }),
    db.ticket.findMany({ where: scope, orderBy: { updatedAt: "desc" } }),
    ["OWNER", "ADMIN"].includes(actor.role)
      ? db.actionProposal.findMany({
          where: scope,
          orderBy: { createdAt: "desc" },
        })
      : [],
    db.membership.findMany({
      where: scope,
      select: { role: true, user: { select: { name: true, email: true } } },
    }),
    db.widgetInstallation.findMany({
      where: scope,
      select: { publicKey: true, allowedOrigins: true },
    }),
    ["OWNER", "ADMIN"].includes(actor.role)
      ? db.auditEvent.findMany({
          where: scope,
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [],
  ]);
  return {
    organization,
    conversations,
    articles,
    tickets,
    proposals,
    members,
    installations,
    audit,
    role: actor.role,
    userId: actor.userId,
  };
}
export async function outbox(
  tx: Prisma.TransactionClient,
  organizationId: string,
  aggregateId: string,
  eventType: string,
  payload: Prisma.InputJsonValue = {},
) {
  return tx.outboxEvent.create({
    data: { organizationId, aggregateId, eventType, payload },
  });
}
export async function sendMessage(
  actor: {
    organizationId: string;
    visitorId?: string;
    userId?: string;
    role?: Actor["role"];
  },
  id: string,
  input: { body: string; clientMessageId: string; internal: boolean },
) {
  if (actor.userId) requireCapability(actor as Actor, "reply");
  if (actor.visitorId && input.internal)
    throw new DomainError(
      "FORBIDDEN",
      403,
      "Visitors cannot create internal notes.",
    );
  await conversationFor(actor, id);
  return db.$transaction(async (tx) => {
    // Serialize sends on the conversation so duplicate client IDs cannot race.
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${id}::uuid AND "organizationId" = ${actor.organizationId}::uuid FOR UPDATE`;
    const existing = await tx.message.findUnique({
      where: {
        conversationId_clientMessageId: {
          conversationId: id,
          clientMessageId: input.clientMessageId,
        },
      },
    });
    if (existing) return existing;
    const message = await tx.message.create({
      data: {
        ...input,
        conversationId: id,
        organizationId: actor.organizationId,
        senderType: actor.visitorId ? "VISITOR" : "AGENT",
        senderId: actor.visitorId ?? actor.userId,
      },
    });
    await tx.conversation.update({
      where: { id },
      data: { lastMessageAt: new Date(), version: { increment: 1 } },
    });
    await outbox(
      tx,
      actor.organizationId,
      id,
      actor.visitorId ? "visitor.message" : "message.created",
      { messageId: message.id },
    );
    return message;
  });
}
export async function transitionConversation(
  actor: Actor,
  id: string,
  version: number,
  status?: "OPEN" | "PENDING" | "RESOLVED",
  handoff = false,
) {
  requireCapability(actor, "reply");
  await conversationFor(actor, id);
  return db.$transaction(async (tx) => {
    const result = await tx.conversation.updateMany({
      where: { id, organizationId: actor.organizationId, version },
      data: {
        status,
        version: { increment: 1 },
        ...(handoff ? { aiEnabled: false, assignedUserId: actor.userId } : {}),
      },
    });
    if (!result.count)
      throw new DomainError(
        "CONFLICT",
        409,
        "This conversation changed. Refresh and try again.",
      );
    await tx.auditEvent.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: handoff
          ? "conversation.handoff"
          : `conversation.${status?.toLowerCase()}`,
        targetId: id,
      },
    });
    await outbox(tx, actor.organizationId, id, "conversation.updated");
    return { updated: true };
  });
}
export async function decideProposal(
  actor: Actor,
  id: string,
  approve: boolean,
) {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: actor.organizationId },
  });
  requireCapability(actor, "approve", org.adminApproval);
  return db.$transaction(async (tx) => {
    const proposal = await tx.actionProposal.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!proposal)
      throw new DomainError("NOT_FOUND", 404, "Proposal not found.");
    assertPending(proposal.state, proposal.expiresAt);
    const updated = await tx.actionProposal.updateMany({
      where: {
        id,
        organizationId: actor.organizationId,
        state: "PENDING",
        expiresAt: { gt: new Date() },
      },
      data: {
        state: approve ? "APPROVED" : "REJECTED",
        approvedBy: actor.userId,
      },
    });
    if (!updated.count)
      throw new DomainError(
        "CONFLICT",
        409,
        "This proposal has already been reviewed.",
      );
    await tx.auditEvent.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: approve ? "refund.approved" : "refund.rejected",
        targetId: id,
      },
    });
    await outbox(
      tx,
      actor.organizationId,
      proposal.conversationId,
      approve ? "refund.approved" : "action.updated",
      { proposalId: id },
    );
    return { state: approve ? "APPROVED" : "REJECTED" };
  });
}
export async function executeRefund(
  proposalId: string,
  organizationId: string,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ActionProposal" WHERE id = ${proposalId}::uuid AND "organizationId" = ${organizationId}::uuid FOR UPDATE`;
    const p = await tx.actionProposal.findFirst({
      where: { id: proposalId, organizationId },
    });
    if (!p || p.state === "EXECUTED") return;
    if (p.state !== "APPROVED" || !p.approvedBy)
      throw new DomainError(
        "NOT_APPROVED",
        409,
        "Refund requires human approval.",
      );
    if (p.expiresAt <= new Date()) {
      await tx.actionProposal.update({
        where: { id: proposalId },
        data: { state: "EXPIRED" },
      });
      await tx.auditEvent.create({
        data: {
          organizationId,
          actorId: "worker",
          action: "refund.expired",
          targetId: proposalId,
        },
      });
      await outbox(tx, organizationId, p.conversationId, "action.updated");
      return;
    }
    const approver = await tx.membership.findUnique({
      where: {
        organizationId_userId: { organizationId, userId: p.approvedBy },
      },
    });
    const org = await tx.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    if (!approver)
      throw new DomainError(
        "FORBIDDEN",
        403,
        "Approver is no longer a member.",
      );
    requireCapability(
      { organizationId, userId: p.approvedBy, role: approver.role },
      "approve",
      org.adminApproval,
    );
    const c = await tx.conversation.findFirstOrThrow({
      where: { id: p.conversationId, organizationId },
    });
    const order = await tx.externalOrder.findFirst({
      where: {
        organizationId,
        visitorId: c.visitorId,
        orderNumber: p.orderNumber,
      },
    });
    if (!order || p.amountCents <= 0 || p.amountCents > order.amountCents)
      throw new DomainError(
        "INVALID_REFUND",
        409,
        "Refund does not match the verified order.",
      );
    await tx.simulatedRefund.upsert({
      where: { proposalId },
      create: {
        proposalId,
        organizationId,
        orderNumber: p.orderNumber,
        amountCents: p.amountCents,
      },
      update: {},
    });
    await tx.actionProposal.update({
      where: { id: proposalId },
      data: { state: "EXECUTED" },
    });
    await tx.auditEvent.create({
      data: {
        organizationId,
        actorId: "worker",
        action: "refund.executed.simulated",
        targetId: proposalId,
      },
    });
    await outbox(tx, organizationId, p.conversationId, "action.updated");
  });
}
