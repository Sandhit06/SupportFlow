import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../../packages/db/src";
import { io } from "socket.io-client";

test("a new owner registers and creates an isolated workspace", async ({
  page,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `owner-${suffix}@example.test`;
  const slug = `test-${suffix}`;
  try {
    await page.goto("/register");
    await page.getByLabel("Your name").fill("Test Owner");
    await page.getByLabel("Work email").fill(email);
    await page.getByLabel("Password").fill("Local-registration-test-2026!");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/onboarding/, { timeout: 60000 });
    await page.getByLabel("Organization name").fill("Test Workspace");
    await page.getByLabel("Workspace slug").fill(slug);
    await page.getByLabel("Website origin").fill("http://localhost:3002");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(new RegExp(`/workspace/${slug}`), {
      timeout: 60000,
    });
    const organization = await db.organization.findUniqueOrThrow({
      where: { slug },
      include: { memberships: true, installations: true },
    });
    expect(organization.memberships).toHaveLength(1);
    expect(organization.memberships[0].role).toBe("OWNER");
    expect(organization.installations[0].allowedOrigins).toEqual([
      "http://localhost:3002",
    ]);
    expect(
      await db.conversation.count({
        where: { organizationId: organization.id },
      }),
    ).toBe(0);
    const acme = await db.organization.findUniqueOrThrow({
      where: { slug: "acme-bikes" },
    });
    expect(
      (
        await page.request.get(`/api/v1/organizations/${acme.id}/workspace`)
      ).status(),
    ).toBe(404);
  } finally {
    await db.organization.deleteMany({ where: { slug } });
    await db.user.deleteMany({ where: { email } });
  }
});

test("visitor → durable AI → human approval → one simulated refund, with isolation", async ({
  browser,
  page,
}) => {
  const password = process.env.DEMO_PASSWORD;
  if (!password)
    throw new Error(
      "DEMO_PASSWORD is required. Run migrations and seed before this suite.",
    );
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("owner@acme-bikes.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/workspace\/acme-bikes/, { timeout: 60000 });
  const acme = await db.organization.findUniqueOrThrow({
    where: { slug: "acme-bikes" },
  });
  const northstar = await db.organization.findUniqueOrThrow({
    where: { slug: "northstar-gadgets" },
  });
  const denied = await page.request.get(
    `/api/v1/organizations/${northstar.id}/workspace`,
  );
  expect(denied.status()).toBe(404);
  const other = await db.conversation.findFirstOrThrow({
    where: { organizationId: northstar.id },
  });
  const forged = await page.request.get(
    `/api/v1/organizations/${acme.id}/conversations/${other.id}`,
  );
  expect(forged.status()).toBe(404);
  const auth = await page.request.get(
    `/api/v1/organizations/${acme.id}/realtime-token`,
  );
  const { token } = await auth.json();
  const socket = io("http://localhost:3001", { auth: { token } });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("connect_error", reject);
    });
    const join = (await socket
      .timeout(5000)
      .emitWithAck("conversation:join", other.id)) as { ok: boolean };
    expect(join.ok).toBe(false);
  } finally {
    socket.disconnect();
  }

  const customer = await browser.newContext();
  try {
    const store = await customer.newPage();
    await store.goto("http://localhost:3002");
    await store.getByRole("button", { name: "Chat with us" }).click();
    const widget = store.frameLocator(
      'iframe[title="Acme Bikes customer support"]',
    );
    const marker = `Delivery question ${crypto.randomUUID()}`;
    await widget
      .getByRole("textbox", { name: "Message", exact: true })
      .fill(marker);
    await widget
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Search conversations" })
      .fill(marker);
    const visitorThread = page
      .locator(".conversation-item")
      .filter({ hasText: "Website visitor" });
    await expect(visitorThread).toBeVisible({ timeout: 20000 });
    await visitorThread.click();
    await expect(
      page.getByRole("log").getByText(marker, { exact: true }),
    ).toBeVisible();
    const saved = await db.message.findFirstOrThrow({
      where: { organizationId: acme.id, body: marker },
      include: { conversation: true },
    });
    const orderNumber = `ORD-${Date.now()}`;
    await db.externalOrder.create({
      data: {
        organizationId: acme.id,
        visitorId: saved.conversation.visitorId,
        orderNumber,
        status: "SHIPPED",
        estimatedDelivery: "2026-10-15",
        amountCents: 4900,
      },
    });
    await widget
      .getByRole("textbox", { name: "Message", exact: true })
      .fill(`Where is ${orderNumber}?`);
    await widget
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      widget.getByText(`Verified order ${orderNumber}:`, { exact: false }),
    ).toBeVisible({ timeout: 20000 });
    await widget
      .getByRole("textbox", { name: "Message", exact: true })
      .fill(`Please refund ${orderNumber}`);
    await widget
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      widget.getByText(`Your refund request for ${orderNumber}`, {
        exact: false,
      }),
    ).toBeVisible({ timeout: 20000 });
    const proposal = await db.actionProposal.findFirstOrThrow({
      where: { organizationId: acme.id, orderNumber },
    });
    expect(proposal.state).toBe("PENDING");
    expect(
      await db.simulatedRefund.count({ where: { proposalId: proposal.id } }),
    ).toBe(0);
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "Approvals", exact: true })
      .click();
    await page
      .locator(".approval-card")
      .filter({ hasText: orderNumber })
      .getByRole("button", { name: "Approve refund" })
      .click();
    await expect
      .poll(
        async () =>
          db.simulatedRefund.count({ where: { proposalId: proposal.id } }),
        { timeout: 20000 },
      )
      .toBe(1);
    const duplicate = await page.request.post(
      `/api/v1/organizations/${acme.id}/action-proposals/${proposal.id}/approve`,
      { headers: { Origin: "http://localhost:3000" }, data: {} },
    );
    expect(duplicate.status()).toBe(409);
    expect(
      await db.simulatedRefund.count({ where: { proposalId: proposal.id } }),
    ).toBe(1);
    await widget.getByRole("button", { name: "Talk to a person" }).click();
    await expect(
      widget.getByText("I’ve paused AI assistance", { exact: false }),
    ).toBeVisible({ timeout: 20000 });
    expect(
      (
        await db.conversation.findUniqueOrThrow({
          where: { id: saved.conversationId },
        })
      ).aiEnabled,
    ).toBe(false);
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: /^Inbox/ })
      .click();
    // The same selected conversation remains open when returning from approvals.
    const privateNote = `Private review ${crypto.randomUUID()}`;
    await page
      .getByRole("button", { name: "Internal note", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Internal note", exact: true })
      .fill(privateNote);
    await page.getByRole("button", { name: "Save note", exact: true }).click();
    await expect(
      page.getByRole("log").getByText(privateNote, { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Reply", exact: true }).click();
    const staffReply = `Your support team is here ${crypto.randomUUID()}`;
    await page
      .getByRole("textbox", { name: "Reply to customer" })
      .fill(staffReply);
    await page.getByRole("button", { name: "Send reply", exact: true }).click();
    await expect(widget.getByRole("log").getByText(staffReply)).toBeVisible({
      timeout: 20000,
    });
    await expect(widget.getByRole("log").getByText(privateNote)).toHaveCount(0);
    // Reloading the embedding origin must recover the same visitor, without losing history.
    await store.reload();
    await store.getByRole("button", { name: "Chat with us" }).click();
    await expect(
      store.frameLocator("iframe").getByRole("log").getByText(marker),
    ).toBeVisible({ timeout: 20000 });
  } finally {
    await customer.close();
  }
});
