export type Message = {
  id: string;
  body: string;
  senderType: "VISITOR" | "AGENT" | "AI" | "SYSTEM";
  createdAt: string;
  internal?: boolean;
};
export type Conversation = {
  id: string;
  subject: string;
  status: "OPEN" | "PENDING" | "RESOLVED";
  aiEnabled: boolean;
  assignedUserId: string | null;
  version: number;
  visitor: { name: string };
  messages: Message[];
  lastMessageAt: string;
};
export type Article = {
  id: string;
  title: string;
  body: string;
  published: boolean;
  version: number;
  updatedAt: string;
};
export type Ticket = {
  id: string;
  conversationId: string;
  subject: string;
  status: "OPEN" | "PENDING" | "RESOLVED";
  priority: string;
};
export type Proposal = {
  id: string;
  conversationId: string;
  orderNumber: string;
  amountCents: number;
  reason: string;
  state: string;
  createdAt: string;
  approvedBy?: string | null;
};
export type WorkspaceData = {
  organization: {
    id: string;
    name: string;
    slug: string;
    aiEnabled: boolean;
    retentionDays: number;
  };
  conversations: Conversation[];
  articles: Article[];
  tickets: Ticket[];
  proposals: Proposal[];
  role: string;
  userId: string;
  members: { user: { name: string; email: string }; role: string }[];
  installations: { publicKey: string; allowedOrigins: string[] }[];
  audit: { id: string; action: string; actorId: string; createdAt: string }[];
};
export function createDemo(slug = "acme-bikes"): WorkspaceData {
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
    "Jamie Chen",
    "Taylor Brooks",
  ];
  const subjects = [
    "A little help with my order",
    "Can I exchange my helmet?",
    "Finding the right fit",
    "Refund for a damaged light",
    "When will the trail bike return?",
    "Thanks for the quick help!",
    "Updating my delivery address",
    "A question about the warranty",
    "Choosing my first city bike",
    "Order tracking update",
    "Bike maintenance advice",
    "A missing accessory",
  ];
  const snippets = [
    "Hi! Any update on order ORD-1003? I’m excited to get riding.",
    "Would a medium be a better fit?",
    "I’m between two sizes. What would you recommend?",
    "The light arrived damaged. Can I get a refund?",
    "Do you know when the sage color will be back?",
    "Perfect, that’s everything I needed. Thank you!",
  ];
  const now = Date.now();
  const conversations: Conversation[] = names.map((name, i) => ({
    id: `demo-conversation-${i}`,
    subject: subjects[i],
    status: i === 5 || i > 9 ? "RESOLVED" : i === 3 ? "PENDING" : "OPEN",
    aiEnabled: i !== 1 && i !== 3,
    assignedUserId: i === 1 ? "demo-user" : null,
    version: 1,
    visitor: { name },
    lastMessageAt: new Date(now - i * 900000).toISOString(),
    messages: [
      {
        id: `demo-message-${i}`,
        body: snippets[i % 6],
        senderType: "VISITOR",
        createdAt: new Date(now - i * 900000).toISOString(),
      },
      ...(i === 0
        ? [
            {
              id: "demo-ai-0",
              body: "I found your order, Olivia. Your City Commuter is on its way! It’s expected to arrive on Thursday, October 15.\n\nYou’re all set for your next adventure.",
              senderType: "AI" as const,
              createdAt: new Date(now - 60000).toISOString(),
            },
            {
              id: "demo-reply-0",
              body: "Amazing, thank you! Will I need any tools to assemble it?",
              senderType: "VISITOR" as const,
              createdAt: new Date(now).toISOString(),
            },
          ]
        : []),
    ],
  }));
  const articleTitles = [
    "Shipping & delivery",
    "Returns & exchanges",
    "Getting your bike ready",
    "Warranty & repairs",
    "Finding your perfect size",
    "Caring for your bike",
  ];
  return {
    organization: {
      id: `demo-${slug}`,
      name: slug === "acme-bikes" ? "Acme Bikes" : "Northstar Gadgets",
      slug,
      aiEnabled: true,
      retentionDays: 90,
    },
    conversations,
    articles: articleTitles.map((title, i) => ({
      id: `article-${i}`,
      title,
      body: [
        "Orders ship within 2 business days. Standard delivery takes 3–5 business days. You can find tracking information in your order confirmation.",
        "Unused items can be returned within 30 days of delivery. Contact our support team with your order number to start a return. Refund requests require team approval.",
        "Your bike arrives 90% assembled. An Allen key and a simple setup guide are included. Attach the front wheel, adjust the saddle, and check the brakes before your first ride.",
        "All frames include a two-year limited warranty covering manufacturing defects. Normal wear is excluded.",
        "Measure your height and inseam. If you fall between sizes, contact our team for a personalized recommendation.",
        "Clean your chain regularly, check tire pressure weekly, and book a tune-up every six months.",
      ][i],
      published: i !== 4,
      version: 1,
      updatedAt: new Date(now - i * 86400000).toISOString(),
    })),
    tickets: conversations.slice(0, 8).map((c, i) => ({
      id: `ticket-${i}`,
      conversationId: c.id,
      subject: c.subject,
      status: c.status,
      priority: i === 3 ? "HIGH" : i % 3 === 0 ? "LOW" : "MEDIUM",
    })),
    proposals: [
      {
        id: "proposal-1",
        conversationId: conversations[3].id,
        orderNumber: "ORD-1008",
        amountCents: 4900,
        reason: "Front light arrived damaged. Customer requested a refund.",
        state: "PENDING",
        createdAt: new Date(now - 3600000).toISOString(),
      },
      {
        id: "proposal-2",
        conversationId: conversations[1].id,
        orderNumber: "ORD-1006",
        amountCents: 7900,
        reason: "Helmet returned in original packaging.",
        state: "PENDING",
        createdAt: new Date(now - 7200000).toISOString(),
      },
    ],
    role: "OWNER",
    userId: "demo-user",
    members: [
      {
        user: { name: "Alex Morgan", email: "alex@example.test" },
        role: "OWNER",
      },
      {
        user: { name: "Jamie Chen", email: "jamie@example.test" },
        role: "AGENT",
      },
    ],
    installations: [
      {
        publicKey:
          slug === "acme-bikes" ? "pub_demo_acme" : "pub_demo_northstar",
        allowedOrigins: ["http://localhost:3002"],
      },
    ],
    audit: [],
  };
}
