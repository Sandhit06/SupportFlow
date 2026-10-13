import { expect, it } from "vitest";
import { registrationSchema } from "../../packages/contracts/src";
import { hashRefreshToken } from "../../packages/core/src/visitor-session";
it("normalizes email and enforces a long password at the registration boundary", () => {
  expect(
    registrationSchema.parse({
      name: "Alex",
      email: "ALEX@EXAMPLE.COM",
      password: "A-long-test-password",
    }).email,
  ).toBe("alex@example.com");
  expect(
    registrationSchema.safeParse({
      name: "Alex",
      email: "alex@example.com",
      password: "short",
    }).success,
  ).toBe(false);
});
it("stores a one-way refresh-token digest rather than a bearer credential", () => {
  const raw = "a-secret-refresh-credential";
  const digest = hashRefreshToken(raw);
  expect(digest).toHaveLength(64);
  expect(digest).not.toContain(raw);
  expect(hashRefreshToken(raw)).toBe(digest);
  expect(hashRefreshToken("different")).not.toBe(digest);
});
