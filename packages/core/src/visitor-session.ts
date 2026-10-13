import { createHash, randomBytes } from "node:crypto";
import { db } from "../../db/src";
import { issueToken } from "./tokens";
import { DomainError } from "./policy";

export function hashRefreshToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** A refresh credential is installation-bound, hashed at rest, and rotated atomically. */
export async function bootstrapVisitor(
  installationKey: string,
  origin: string,
  refreshToken?: string | null,
) {
  const installation = await db.widgetInstallation.findUnique({
    where: { publicKey: installationKey },
    include: { organization: true },
  });
  if (!installation?.active || !installation.allowedOrigins.includes(origin))
    throw new DomainError(
      "FORBIDDEN",
      403,
      "This website is not allowed to load this widget.",
    );
  const nextRefresh = randomBytes(32).toString("base64url");
  const session = await db.$transaction(async (tx) => {
    if (refreshToken) {
      const existing = await tx.visitorSession.findFirst({
        where: {
          refreshTokenHash: hashRefreshToken(refreshToken),
          installationId: installation.id,
          organizationId: installation.organizationId,
          revoked: false,
          expiresAt: { gt: new Date() },
        },
      });
      if (!existing)
        throw new DomainError(
          "SESSION_EXPIRED",
          401,
          "Your visitor session expired. Start a new conversation to continue.",
        );
      const rotated = await tx.visitorSession.updateMany({
        where: {
          id: existing.id,
          refreshTokenHash: hashRefreshToken(refreshToken),
          revoked: false,
        },
        data: { refreshTokenHash: hashRefreshToken(nextRefresh) },
      });
      if (!rotated.count)
        throw new DomainError(
          "SESSION_ROTATED",
          409,
          "This session was refreshed elsewhere. Reopen the chat.",
        );
      return existing;
    }
    const visitor = await tx.visitor.create({
      data: { organizationId: installation.organizationId },
    });
    return tx.visitorSession.create({
      data: {
        organizationId: installation.organizationId,
        visitorId: visitor.id,
        installationId: installation.id,
        refreshTokenHash: hashRefreshToken(nextRefresh),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
  });
  return {
    visitorToken: await issueToken({
      kind: "visitor",
      organizationId: session.organizationId,
      visitorId: session.visitorId,
      sessionId: session.id,
    }),
    refreshToken: nextRefresh,
    visitorId: session.visitorId,
    organizationDisplayName: installation.organization.name,
    expiresIn: 900,
  };
}
