import "dotenv/config";
import { hash } from "argon2";
import { db } from "./index";
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 12)
  throw new Error(
    "Set DEMO_PASSWORD to at least 12 characters. Demo seeds are for local development only.",
  );
const passwordHash = await hash(password);
for (const [slug, name, origin, key] of [
  ["acme-bikes", "Acme Bikes", "http://localhost:3002", "pub_demo_acme"],
  [
    "northstar-gadgets",
    "Northstar Gadgets",
    "http://localhost:3003",
    "pub_demo_northstar",
  ],
]) {
  const org = await db.organization.upsert({
    where: { slug },
    create: { slug, name },
    update: {},
  });
  for (const role of ["OWNER", "AGENT", "VIEWER"] as const) {
    const email = `${role.toLowerCase()}@${slug}.test`;
    const user = await db.user.upsert({
      where: { email },
      create: {
        email,
        name:
          role === "OWNER"
            ? "Alex Morgan"
            : role === "AGENT"
              ? "Jamie Chen"
              : "Taylor Brooks",
        passwordHash,
      },
      update: {},
    });
    await db.membership.upsert({
      where: {
        organizationId_userId: { organizationId: org.id, userId: user.id },
      },
      create: { organizationId: org.id, userId: user.id, role },
      update: {},
    });
  }
  await db.widgetInstallation.upsert({
    where: { publicKey: key },
    create: {
      publicKey: key,
      organizationId: org.id,
      allowedOrigins: [origin],
    },
    update: {},
  });
  if (await db.conversation.count({ where: { organizationId: org.id } }))
    continue;
  const names = [
    "Olivia Rhye",
    "Phoenix Baker",
    "Lana Steiner",
    "Demi Wilkinson",
    "Drew Cano",
    "Natali Craig",
    "Orlando Diggs",
    "Andi Lane",
    "Kate Morrison",
    "Alex Morgan",
  ];
  for (let i = 0; i < 20; i++) {
    const visitor = await db.visitor.create({
      data: { organizationId: org.id, name: names[i % names.length] },
    });
    const createdAt = new Date(Date.now() - i * 6 * 3600000);
    const conversation = await db.conversation.create({
      data: {
        organizationId: org.id,
        visitorId: visitor.id,
        subject:
          i % 3 === 0
            ? "A little help with my order"
            : i % 3 === 1
              ? "Getting ready for the next adventure"
              : "A question about delivery",
        status: i % 5 === 0 ? "RESOLVED" : i % 4 === 0 ? "PENDING" : "OPEN",
        aiEnabled: i % 4 !== 0,
        createdAt,
        lastMessageAt: createdAt,
      },
    });
    for (let j = 0; j < 5; j++)
      await db.message.create({
        data: {
          organizationId: org.id,
          conversationId: conversation.id,
          senderType: j % 2 === 0 ? "VISITOR" : "AI",
          body: [
            "Hi! Could you help me with my order?",
            "I’m here to help. What would you like to know?",
            "How long does delivery usually take?",
            "Standard delivery takes 3–5 business days. Source: Shipping & delivery.",
            "Thank you. That’s helpful!",
          ][j],
          clientMessageId: crypto.randomUUID(),
          createdAt: new Date(createdAt.getTime() + j * 60000),
        },
      });
    const orderNumber = `ORD-${1003 + i}`;
    await db.externalOrder.create({
      data: {
        organizationId: org.id,
        visitorId: visitor.id,
        orderNumber,
        status: slug === "acme-bikes" ? "SHIPPED" : "PROCESSING",
        amountCents: 4900 + i * 1000,
        estimatedDelivery: "2026-10-15",
      },
    });
    if (i < 8)
      await db.ticket.create({
        data: {
          organizationId: org.id,
          conversationId: conversation.id,
          subject: conversation.subject,
          priority: i === 3 ? "HIGH" : "MEDIUM",
          status: conversation.status,
        },
      });
    if (i === 0 || i === 3)
      await db.actionProposal.create({
        data: {
          organizationId: org.id,
          conversationId: conversation.id,
          orderNumber,
          amountCents: 4900 + i * 1000,
          reason: "Customer requested a refund for a damaged accessory.",
          requestedBy: visitor.id,
          expiresAt: new Date(Date.now() + 7 * 86400000),
          idempotencyKey: `seed-refund-${i}`,
        },
      });
  }
  const articles = [
    [
      "Shipping & delivery",
      "Orders ship within 2 business days. Standard delivery takes 3–5 business days.",
    ],
    [
      "Returns & exchanges",
      "Unused items can be returned within 30 days. Refunds require staff approval.",
    ],
    [
      "Getting your bike ready",
      "An Allen key and setup guide are included. Check brakes and tire pressure before riding.",
    ],
    [
      "Warranty & repairs",
      "Frames include a two-year limited warranty against manufacturing defects.",
    ],
    [
      "Finding your size",
      "Contact our team with your height and inseam for help selecting a frame.",
    ],
    [
      "Caring for your bike",
      "Clean the chain regularly and check tire pressure weekly.",
    ],
    [
      "Support hours",
      "Our team is available Monday through Friday, 9am to 5pm.",
    ],
    [
      "Payment methods",
      "This demo does not process payments or store card information.",
    ],
    [
      "Order changes",
      "Contact a person before requesting changes to an existing order.",
    ],
    [
      "Assembly assistance",
      "Our team can help you follow the included assembly guide.",
    ],
  ];
  for (const [title, body] of articles)
    await db.knowledgeArticle.create({
      data: {
        organizationId: org.id,
        title,
        body,
        published: title !== "Finding your size",
      },
    });
}
console.log(
  "Seeded two isolated fictional workspaces. Credentials: docs/local-demo.md",
);
await db.$disconnect();
