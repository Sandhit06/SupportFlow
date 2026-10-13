import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { getEnv } from "../../config/src";
import { db } from "../../db/src";
import { DomainError } from "./policy";
import { member } from "./service";
const claims = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("staff"),
    organizationId: z.uuid(),
    userId: z.uuid(),
  }),
  z.object({
    kind: z.literal("visitor"),
    organizationId: z.uuid(),
    visitorId: z.uuid(),
    sessionId: z.uuid(),
  }),
]);
export type TokenClaims = z.infer<typeof claims>;
export async function issueToken(data: TokenClaims) {
  return new SignJWT({ ...data })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .setIssuer("supportflow")
    .setAudience("supportflow-realtime")
    .sign(new TextEncoder().encode(getEnv().VISITOR_JWT_SECRET));
}
export async function verifyToken(token: string) {
  let c: TokenClaims;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(getEnv().VISITOR_JWT_SECRET),
      {
        algorithms: ["HS256"],
        issuer: "supportflow",
        audience: "supportflow-realtime",
      },
    );
    c = claims.parse(payload);
  } catch {
    throw new DomainError(
      "UNAUTHORIZED",
      401,
      "Session is invalid or expired.",
    );
  }
  if (c.kind === "staff") await member(c.userId, c.organizationId);
  else {
    const session = await db.visitorSession.findFirst({
      where: {
        id: c.sessionId,
        organizationId: c.organizationId,
        visitorId: c.visitorId,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
    });
    if (!session)
      throw new DomainError("UNAUTHORIZED", 401, "Visitor session expired.");
  }
  return c;
}
