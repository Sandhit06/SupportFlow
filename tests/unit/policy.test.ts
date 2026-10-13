import { describe, it, expect } from "vitest";
import {
  requireCapability,
  assertPending,
} from "../../packages/core/src/policy";
import {
  messageSchema,
  organizationSchema,
} from "../../packages/contracts/src";
describe("authorization matrix", () => {
  for (const role of ["OWNER", "ADMIN", "AGENT", "VIEWER"] as const) {
    const actor = { userId: "u", organizationId: "a", role };
    it(`${role} can read`, () =>
      expect(() => requireCapability(actor, "read")).not.toThrow());
    it(`${role} has correct approval access`, () => {
      if (role === "OWNER" || role === "ADMIN")
        expect(() => requireCapability(actor, "approve")).not.toThrow();
      else expect(() => requireCapability(actor, "approve")).toThrow();
    });
  }
  it("owner policy can disallow admin approval", () =>
    expect(() =>
      requireCapability(
        { userId: "u", organizationId: "a", role: "ADMIN" },
        "approve",
        false,
      ),
    ).toThrow());
  it("viewer cannot reply", () =>
    expect(() =>
      requireCapability(
        { userId: "u", organizationId: "a", role: "VIEWER" },
        "reply",
      ),
    ).toThrow());
});
it("rejects expired and already processed proposals", () => {
  expect(() => assertPending("PENDING", new Date(0))).toThrow();
  expect(() =>
    assertPending("APPROVED", new Date(Date.now() + 10000)),
  ).toThrow();
});
it("rejects blank, oversized and unidentified messages", () => {
  for (const body of ["", "  ", "a".repeat(4001)])
    expect(
      messageSchema.safeParse({ body, clientMessageId: crypto.randomUUID() })
        .success,
    ).toBe(false);
  expect(
    messageSchema.safeParse({ body: "Hello", clientMessageId: "bad" }).success,
  ).toBe(false);
});
it("rejects wildcard, insecure and path-bearing widget origins", () => {
  for (const origin of [
    "https://*.example.com/path",
    "http://example.com",
    "https://example.com/path",
  ])
    expect(
      organizationSchema.safeParse({ name: "Acme", slug: "acme", origin })
        .success,
    ).toBe(false);
});
