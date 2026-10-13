import { test, expect } from "@playwright/test";
test("reply, resolve, create knowledge, approve and toggle appearance", async ({
  page,
  isMobile,
}) => {
  await page.goto("/preview");
  await expect(
    page.getByText("Interactive preview", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Reply to customer" })
    .fill("Thanks Olivia. An Allen key is included!");
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(
    page
      .getByRole("log")
      .getByText("Thanks Olivia. An Allen key is included!", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reopen", exact: true }),
  ).toBeVisible();
  async function navigate(name: string) {
    if (isMobile)
      await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name, exact: true })
      .click();
  }
  await navigate("Knowledge");
  await page.getByRole("button", { name: "New article", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("A test assembly guide");
  await page
    .getByLabel("Article", { exact: true })
    .fill("The Allen key is included with every bike in this test.");
  await page.getByRole("button", { name: "Publish article" }).click();
  await expect(
    page.getByRole("heading", { name: "A test assembly guide" }),
  ).toBeVisible();
  await navigate("Approvals");
  await page.getByRole("button", { name: "Approve refund" }).first().click();
  await expect(
    page.getByText("Approved · awaiting worker execution"),
  ).toBeVisible();
  if (isMobile)
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Use dark appearance" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
test("search, private note, ticket, and responsive boundaries", async ({
  page,
  isMobile,
}) => {
  await page.goto("/preview");
  await page
    .getByRole("button", { name: "Internal note", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Internal note", exact: true })
    .fill("Check assembly guide with the team.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    page
      .getByRole("log")
      .getByText("Check assembly guide with the team.", { exact: true }),
  ).toBeVisible();
  if (isMobile)
    await page.getByRole("button", { name: "Back to conversations" }).click();
  await page
    .getByRole("textbox", { name: "Search conversations" })
    .fill("does-not-exist");
  await expect(
    page.getByRole("heading", { name: "No conversations found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page
    .getByRole("button", { name: "New ticket", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Subject", { exact: true })
    .fill("Follow up on assembly");
  await page
    .getByRole("button", { name: "Create ticket", exact: true })
    .click();
  await expect(
    page.getByText("Follow up on assembly", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
