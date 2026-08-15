import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("studio-canvas")).toBeVisible();
});

test("loads a canonical project and supports precise human editing, persistence, undo, and responsive viewports", async ({
  page,
}) => {
  const headingLayer = page.locator('[data-node-id="text_10000000-0000-4000-8000-000000000010"]');
  await headingLayer.click();
  await expect(page.getByTestId("properties-panel")).toContainText("Hero heading");

  const xField = page.locator(".numeric-field").filter({ hasText: "X" }).locator("input").first();
  await xField.fill("180");
  await xField.press("Enter");
  await expect(page.locator(".document-identity")).toContainText("v2");

  const sizeField = page
    .locator(".property-section")
    .filter({ hasText: "Typography" })
    .locator(".numeric-field")
    .filter({ hasText: "Size" })
    .locator("input");
  await sizeField.fill("92");
  await sizeField.press("Enter");
  await page.getByLabel("Undo").click();
  await expect(page.locator(".document-identity")).toContainText("v2");
  await page.getByLabel("Redo").click();
  await expect(page.locator(".document-identity")).toContainText("v3");

  await page.getByLabel("Mobile").click();
  await expect(page.locator(".canvas-stage")).toHaveAttribute("data-viewport", "MOBILE");
  await page.reload();
  await headingLayer.click();
  await expect(page.locator(".property-section").filter({ hasText: "Typography" }).locator("select")).toHaveValue(
    "Basic",
  );
  // No real fidelity measurement has run against this fixture text, so the honest status is
  // "unknown", not a fabricated "exact" claim (Block D10).
  await expect(page.locator(".font-status")).toContainText("unknown");
});

test("selects and moves canvas nodes, evaluates animation time, exposes fidelity attribution, and renders nonblank 3D", async ({
  page,
}) => {
  const heading = page.locator('[data-canvas-node="text_10000000-0000-4000-8000-000000000010"]');
  await heading.click();
  await expect(heading).toHaveClass(/selected/);
  const before = await heading.boundingBox();
  if (!before) throw new Error("Heading bounds unavailable.");
  await page.mouse.move(before.x + 10, before.y + 10);
  await page.mouse.down();
  await page.mouse.move(before.x + 30, before.y + 20);
  await page.mouse.up();
  await expect(page.locator(".document-identity")).toContainText("v2");

  await page.getByRole("button", { name: "Animation" }).click();
  const playhead = page.getByLabel("Animation playhead");
  await playhead.fill("0.75");
  await expect(page.locator(".timeline-toolbar strong")).toContainText("0.75s");

  await page.getByRole("button", { name: "Fidelity", exact: true }).click();
  // No ValidationRecord has been computed for this fixture document (fidelity.measure, Block D8,
  // has never run against it), so the honest state is "Not evaluated" -- never a fabricated score.
  await expect(page.locator(".fidelity-empty")).toContainText("Not evaluated");

  await page.getByRole("button", { name: "3D" }).click();
  const canvas = page.getByTestId("three-canvas");
  await expect(canvas).toBeVisible();
  const data = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL("image/png"));
  expect(data.length).toBeGreaterThan(2_000);
  await canvas.click();
  await expect(page.getByTestId("properties-panel")).toContainText("Reconstructed product");
  const meshX = page
    .getByTestId("properties-panel")
    .locator(".numeric-field")
    .filter({ hasText: "X" })
    .locator("input")
    .first();
  await meshX.fill("0.5");
  await meshX.press("Enter");
  await expect(page.locator(".document-identity")).toContainText("v3");
});

test("runs a bounded AI operation with structured status and preserves human plus AI version history", async ({
  page,
}) => {
  await page.locator('[data-node-id="text_10000000-0000-4000-8000-000000000010"]').click();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".document-identity")).toContainText("v2");
  await page.getByLabel("AEVUM AI").click();
  await page.locator(".ai-compose textarea").fill("Move this closer to the center");
  await page.getByLabel("Send instruction").click();
  await expect(page.locator(".ai-status")).toContainText("Complete", { timeout: 8_000 });
  await expect(page.locator(".ai-actions")).toContainText("Changed Hero heading");
  await expect(page.locator(".document-identity")).toContainText("v3");
  await page.getByLabel("Undo").click();
  await page.getByLabel("Redo").click();
  await expect(page.locator(".document-identity")).toContainText("v3");
});

test("degrades safely to a reviewable compact shell", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId("studio-canvas")).toBeVisible();
  await expect(page.locator(".toolrail")).toBeVisible();
  await expect(page.locator(".left-panel")).toBeHidden();
  await expect(page.locator(".properties-panel")).toBeHidden();
});
