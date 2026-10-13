import { db } from "../../db/src";
import { outbox } from "./service";
export async function respondToVisitor(
  eventId: string,
  organizationId: string,
  conversationId: string,
  messageId: string,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId}::uuid AND "organizationId" = ${organizationId}::uuid FOR UPDATE`;
    if (
      await tx.processedJob.findUnique({
        where: { workerName_eventId: { workerName: "mock-ai", eventId } },
      })
    )
      return;
    const c = await tx.conversation.findFirst({
      where: { id: conversationId, organizationId },
    });
    const organization = await tx.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    const message = await tx.message.findFirst({
      where: {
        id: messageId,
        conversationId,
        organizationId,
        senderType: "VISITOR",
      },
    });
    if (!c || !message || !c.aiEnabled || !organization.aiEnabled) return;
    let body =
      "I can’t verify an answer from our approved knowledge. Please ask for a human and our team will help.";
    const number = message.body.match(/ORD-\d+/i)?.[0].toUpperCase();
    if (/human|agent|person|representative/i.test(message.body)) {
      await tx.conversation.update({
        where: { id: conversationId },
        data: { aiEnabled: false, status: "OPEN", version: { increment: 1 } },
      });
      body =
        "I’ve paused AI assistance and requested help from the support team. A person can continue this conversation.";
    } else if (number) {
      const order = await tx.externalOrder.findFirst({
        where: { organizationId, visitorId: c.visitorId, orderNumber: number },
      });
      if (!order)
        body =
          "I couldn’t verify that order for your visitor session. Please ask for a human to help verify ownership.";
      else if (/refund/i.test(message.body)) {
        await tx.actionProposal.upsert({
          where: {
            organizationId_idempotencyKey: {
              organizationId,
              idempotencyKey: `refund-${order.id}`,
            },
          },
          create: {
            organizationId,
            conversationId,
            orderNumber: number,
            amountCents: order.amountCents,
            reason: "Customer requested a refund through chat.",
            requestedBy: c.visitorId,
            expiresAt: new Date(Date.now() + 86400000),
            idempotencyKey: `refund-${order.id}`,
          },
          update: {},
        });
        body = `Your refund request for ${number} has been recorded for staff review. No refund has been executed. All refunds here are simulated.`;
      } else
        body = `Verified order ${number}: ${order.status}. Estimated delivery: ${order.estimatedDelivery}. Source: your authorized order record. (Simulated order data.)`;
    } else {
      const results = await tx.$queryRaw<
        { id: string; title: string; body: string }[]
      >`SELECT id, title, body FROM "KnowledgeArticle" WHERE "organizationId" = ${organizationId}::uuid AND published = true AND to_tsvector('english', title || ' ' || body) @@ plainto_tsquery('english', ${message.body}) LIMIT 1`;
      if (results[0])
        body = `${results[0].body}\n\nSource: ${results[0].title} [${results[0].id}].`;
    }
    await tx.message.create({
      data: {
        organizationId,
        conversationId,
        senderType: "AI",
        body,
        clientMessageId: `ai-${eventId}`,
      },
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), version: { increment: 1 } },
    });
    await tx.processedJob.create({ data: { eventId, workerName: "mock-ai" } });
    await outbox(tx, organizationId, conversationId, "message.created");
  });
}
