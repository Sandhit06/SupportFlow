import type { Actor } from "../../contracts/src";
export class DomainError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireCapability(
  actor: Actor,
  capability: "read" | "reply" | "manage" | "approve",
  adminApproval = true,
) {
  const allowed =
    capability === "read" ||
    (capability === "reply" && actor.role !== "VIEWER") ||
    ((capability === "manage" || capability === "approve") &&
      actor.role === "OWNER") ||
    (actor.role === "ADMIN" &&
      (capability === "manage" || (capability === "approve" && adminApproval)));
  if (!allowed)
    throw new DomainError(
      "FORBIDDEN",
      403,
      "Your role cannot perform this action.",
    );
}
export function assertPending(
  state: string,
  expiresAt: Date,
  now = new Date(),
) {
  if (state !== "PENDING" || expiresAt <= now)
    throw new DomainError(
      "CONFLICT",
      409,
      "This proposal is no longer awaiting approval.",
    );
}
