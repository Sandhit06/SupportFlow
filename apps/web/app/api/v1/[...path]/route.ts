import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "../../../../lib/auth";
import { db } from "../../../../../../packages/db/src";
import { getEnv } from "../../../../../../packages/config/src";
import {
  articleSchema,
  messageSchema,
  organizationSchema,
  ticketSchema,
  ticketUpdateSchema,
} from "../../../../../../packages/contracts/src";
import {
  conversationFor,
  decideProposal,
  member,
  outbox,
  sendMessage,
  transitionConversation,
  workspace,
} from "../../../../../../packages/core/src/service";
import {
  DomainError,
  requireCapability,
} from "../../../../../../packages/core/src/policy";
import {
  issueToken,
  verifyToken,
} from "../../../../../../packages/core/src/tokens";
import {
  rateLimit,
  redis,
} from "../../../../../../packages/core/src/rate-limit";
import { bootstrapVisitor } from "../../../../../../packages/core/src/visitor-session";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
function json(value: unknown, status = 200, origin?: string | null) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(origin
        ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
        : {}),
    },
  });
}
async function handle(request: NextRequest, context: Context) {
  const requestId = crypto.randomUUID();
  let corsOrigin: string | null = null;
  try {
    const { path } = await context.params;
    const method = request.method;
    if (path.join("/") === "health/live") return json({ status: "alive" });
    if (path.join("/") === "health/ready") {
      await db.$queryRaw`SELECT 1`;
      await redis().ping();
      return json({ status: "ready", aiMode: "mock" });
    }
    if (method === "OPTIONS") {
      const origin = request.headers.get("origin");
      const installation = origin
        ? await db.widgetInstallation.findFirst({
            where: { active: true, allowedOrigins: { has: origin } },
          })
        : null;
      if (!installation)
        return json(
          { code: "FORBIDDEN", message: "Origin is not allowed.", requestId },
          403,
        );
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin!,
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          Vary: "Origin",
        },
      });
    }
    if (path.join("/") === "widget/bootstrap" && method === "POST") {
      const origin = request.headers.get("origin");
      const input = z
        .object({
          installationKey: z.string().min(1).max(100),
          refreshToken: z.string().min(40).max(100).nullish(),
        })
        .parse(await request.json());
      const install = await db.widgetInstallation.findUnique({
        where: { publicKey: input.installationKey },
        include: { organization: true },
      });
      if (
        !origin ||
        !install?.active ||
        !install.allowedOrigins.includes(origin)
      )
        throw new DomainError(
          "FORBIDDEN",
          403,
          "This website is not allowed to load this widget.",
        );
      corsOrigin = origin;
      await rateLimit(`bootstrap:${install.id}`, 120, 60);
      return json(
        await bootstrapVisitor(
          input.installationKey,
          origin,
          input.refreshToken,
        ),
        input.refreshToken ? 200 : 201,
        origin,
      );
    }
    if (path[0] === "widget") {
      const token = request.headers
        .get("authorization")
        ?.replace(/^Bearer /, "");
      if (!token)
        throw new DomainError(
          "UNAUTHORIZED",
          401,
          "Visitor authentication required.",
        );
      const actor = await verifyToken(token);
      if (actor.kind !== "visitor")
        throw new DomainError("FORBIDDEN", 403, "Visitor token required.");
      await rateLimit(`visitor:${actor.sessionId}`, 60, 60);
      if (
        path.length === 2 &&
        path[1] === "conversations" &&
        method === "POST"
      ) {
        const conversation = await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Visitor" WHERE id = ${actor.visitorId}::uuid AND "organizationId" = ${actor.organizationId}::uuid FOR UPDATE`;
          const existing = await tx.conversation.findFirst({
            where: {
              organizationId: actor.organizationId,
              visitorId: actor.visitorId,
            },
            orderBy: { createdAt: "desc" },
          });
          if (existing) return existing;
          const created = await tx.conversation.create({
            data: {
              organizationId: actor.organizationId,
              visitorId: actor.visitorId,
              subject: "A new website conversation",
            },
          });
          await outbox(
            tx,
            actor.organizationId,
            created.id,
            "conversation.updated",
          );
          return created;
        });
        return json(conversation);
      }
      const id = z.uuid().parse(path[2]);
      await conversationFor(actor, id);
      if (path[3] === "messages" && method === "GET") {
        const cursor = request.nextUrl.searchParams.get("cursor");
        let after: { createdAt: Date; id: string } | null = null;
        if (cursor) {
          const anchor = await db.message.findFirst({
            where: {
              id: z.uuid().parse(cursor),
              conversationId: id,
              organizationId: actor.organizationId,
              internal: false,
            },
          });
          if (!anchor)
            throw new DomainError("INVALID_CURSOR", 400, "Unknown cursor.");
          after = anchor;
        }
        return json(
          await db.message.findMany({
            where: {
              conversationId: id,
              organizationId: actor.organizationId,
              internal: false,
              ...(after
                ? {
                    OR: [
                      { createdAt: { gt: after.createdAt } },
                      { createdAt: after.createdAt, id: { gt: after.id } },
                    ],
                  }
                : {}),
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 100,
          }),
        );
      }
      if (path[3] === "messages" && method === "POST")
        return json(
          await sendMessage(
            actor,
            id,
            messageSchema.parse(await request.json()),
          ),
          201,
        );
      throw new DomainError("NOT_FOUND", 404, "Endpoint not found.");
    }
    const session = await auth();
    if (!session?.user?.id)
      throw new DomainError("UNAUTHORIZED", 401, "Sign in to continue.");
    if (
      method !== "GET" &&
      request.headers.get("origin") !== new URL(getEnv().APP_URL).origin
    )
      throw new DomainError(
        "FORBIDDEN",
        403,
        "Request origin does not match this workspace.",
      );
    if (path.length === 1 && path[0] === "organizations" && method === "POST") {
      const input = organizationSchema.parse(await request.json());
      const organization = await db.organization.create({
        data: {
          name: input.name,
          slug: input.slug,
          memberships: { create: { userId: session.user.id, role: "OWNER" } },
          installations: {
            create: {
              publicKey: `pub_${crypto.randomUUID()}`,
              allowedOrigins: [input.origin],
            },
          },
        },
      });
      return json(organization, 201);
    }
    if (path[0] !== "organizations")
      throw new DomainError("NOT_FOUND", 404, "Endpoint not found.");
    const organizationId = z.uuid().parse(path[1]);
    const actor = await member(session.user.id, organizationId);
    const resource = path[2];
    const id = path[3];
    const action = path[4];
    if (resource === "workspace" && method === "GET")
      return json(await workspace(actor));
    if (resource === "realtime-token" && method === "GET")
      return json({
        token: await issueToken({
          kind: "staff",
          organizationId,
          userId: actor.userId,
        }),
      });
    if (resource === "conversations" && id) {
      z.uuid().parse(id);
      if (action === "messages" && method === "POST")
        return json(
          await sendMessage(
            actor,
            id,
            messageSchema.parse(await request.json()),
          ),
          201,
        );
      if ((action === "status" || action === "handoff") && method === "POST") {
        const input = z
          .object({
            version: z.number().int().positive(),
            status: z.enum(["OPEN", "PENDING", "RESOLVED"]).optional(),
          })
          .parse(await request.json());
        return json(
          await transitionConversation(
            actor,
            id,
            input.version,
            input.status,
            action === "handoff",
          ),
        );
      }
      if (!action && method === "GET")
        return json(await conversationFor(actor, id));
    }
    if (resource === "tickets") {
      requireCapability(actor, "reply");
      if (method === "POST") {
        const input = ticketSchema.parse(await request.json());
        await conversationFor(actor, input.conversationId);
        return json(
          await db.$transaction(async (tx) => {
            const t = await tx.ticket.create({
              data: { ...input, organizationId },
            });
            await outbox(
              tx,
              organizationId,
              t.conversationId,
              "ticket.updated",
            );
            return t;
          }),
          201,
        );
      }
      if (method === "PATCH" && id) {
        const input = ticketUpdateSchema.parse(await request.json());
        return json(
          await db.$transaction(async (tx) => {
            const t = await tx.ticket.findFirst({
              where: { id: z.uuid().parse(id), organizationId },
            });
            if (!t)
              throw new DomainError("NOT_FOUND", 404, "Ticket not found.");
            const updated = await tx.ticket.update({
              where: { id: t.id },
              data: input,
            });
            await outbox(
              tx,
              organizationId,
              t.conversationId,
              "ticket.updated",
            );
            return updated;
          }),
        );
      }
    }
    if (resource === "knowledge") {
      requireCapability(actor, "manage");
      const input = articleSchema.parse(await request.json());
      if (method === "POST")
        return json(
          await db.knowledgeArticle.create({
            data: { ...input, organizationId },
          }),
          201,
        );
      if (method === "PATCH" && id) {
        const updated = await db.knowledgeArticle.updateMany({
          where: { id: z.uuid().parse(id), organizationId },
          data: { ...input, version: { increment: 1 } },
        });
        if (!updated.count)
          throw new DomainError("NOT_FOUND", 404, "Article not found.");
        return json({ updated: true });
      }
    }
    if (
      resource === "action-proposals" &&
      id &&
      method === "POST" &&
      (action === "approve" || action === "reject")
    )
      return json(
        await decideProposal(actor, z.uuid().parse(id), action === "approve"),
      );
    if (resource === "settings" && method === "PATCH") {
      requireCapability(actor, "manage");
      const input = z
        .object({ aiEnabled: z.boolean() })
        .parse(await request.json());
      return json(
        await db.organization.update({
          where: { id: organizationId },
          data: input,
        }),
      );
    }
    throw new DomainError("NOT_FOUND", 404, "Endpoint not found.");
  } catch (error) {
    const status =
      error instanceof DomainError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : 503;
    const code =
      error instanceof DomainError
        ? error.code
        : error instanceof z.ZodError
          ? "INVALID_INPUT"
          : "SERVICE_UNAVAILABLE";
    if (status === 503)
      console.error(
        JSON.stringify({ level: "error", service: "web", requestId, code }),
      );
    return json(
      {
        code,
        message:
          error instanceof DomainError
            ? error.message
            : error instanceof z.ZodError
              ? "Please check the submitted fields."
              : "The service is temporarily unavailable. Please retry.",
        requestId,
      },
      status,
      corsOrigin,
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as OPTIONS };
