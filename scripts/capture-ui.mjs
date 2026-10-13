import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
await mkdir("docs/images", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1512, height: 1080 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto("http://localhost:3000/preview");
await page.getByRole("textbox", { name: "Reply to customer" }).waitFor();
await page.screenshot({ path: "docs/images/inbox.png", fullPage: true });
await page.getByRole("button", { name: "Use dark appearance" }).click();
await page.screenshot({ path: "docs/images/inbox-dark.png", fullPage: true });
await page.getByRole("button", { name: "Use light appearance" }).click();
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: "docs/images/inbox-mobile.png", fullPage: true });
console.log(
  JSON.stringify({
    errors,
    horizontalOverflow: await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  }),
);
assert.deepEqual(errors, [], "The rendered UI must have no browser errors");
await browser.close();
