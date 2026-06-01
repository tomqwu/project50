import { expect, test } from "@playwright/test";

test("home page renders the app name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("home")).toContainText("project50");
});

test("health endpoint returns ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toEqual({ status: "ok" });
});
