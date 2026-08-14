import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const enabled = process.env.AEVUM_PRODUCTION_E2E === "1";
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
const studioUrl = "https://design-system-aevum-peach.vercel.app";
const apiUrl = "https://aevumapi-production-5fd5.up.railway.app";

test.skip(!enabled, "Production acceptance runs only with AEVUM_PRODUCTION_E2E=1.");

test("authenticates, bootstraps, edits, undoes, redoes, reloads, and cleans up production state", async ({ page }) => {
  if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("Production Supabase environment is required.");
  const email = `studio-release-${randomUUID()}@example.com`;
  const password = `${randomUUID()}-Aa1!`;
  let actorId = "";
  let workspaceId = "";
  const adminHeaders = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };
  try {
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const createdBody = (await created.json()) as { id?: string };
    if (!created.ok || !createdBody.id) throw new Error("Production Studio test user creation failed.");
    actorId = createdBody.id;

    await page.goto(studioUrl);
    await expect(page.locator(".auth-brand")).toContainText("AEVUM");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("studio-canvas")).toBeVisible({ timeout: 25_000 });
    await expect(page.locator(".production-session")).toContainText(email);

    const headingLayer = page.locator('[data-node-id^="text_"]').first();
    await headingLayer.click();
    await expect(page.getByTestId("properties-panel")).toContainText("Heading");
    const xField = page.locator(".numeric-field").filter({ hasText: "X" }).locator("input").first();
    await xField.fill("140");
    await xField.press("Enter");
    await expect(page.locator(".document-identity")).toContainText("v2");
    await page.getByLabel("Undo").click();
    await expect(page.locator(".document-identity")).toContainText("v3");
    await page.getByLabel("Redo").click();
    await expect(page.locator(".document-identity")).toContainText("v4");
    await page.reload();
    await expect(page.getByTestId("studio-canvas")).toBeVisible({ timeout: 25_000 });
    await page.locator('[data-node-id^="text_"]').first().click();
    await expect(page.locator(".numeric-field").filter({ hasText: "X" }).locator("input").first()).toHaveValue("140");
    await expect(page.getByRole("button", { name: "Copy MCP credential" })).toBeVisible();

    const login = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const loginBody = (await login.json()) as { access_token?: string };
    if (!login.ok || !loginBody.access_token) throw new Error("Production Studio verification sign-in failed.");
    const bootstrap = await fetch(`${apiUrl}/v1/bootstrap`, {
      headers: { authorization: `Bearer ${loginBody.access_token}` },
    });
    const bootstrapBody = (await bootstrap.json()) as { workspaces?: Array<{ membership?: { workspaceId?: string } }> };
    workspaceId = bootstrapBody.workspaces?.[0]?.membership?.workspaceId ?? "";
    expect(bootstrap.ok).toBe(true);
    expect(workspaceId).toMatch(/^workspace_/);
  } finally {
    if (!workspaceId && actorId) {
      const membership = await fetch(
        `${supabaseUrl}/rest/v1/workspace_memberships?actor_subject=eq.${encodeURIComponent(actorId)}&select=workspace_id`,
        { headers: adminHeaders },
      );
      const rows = (await membership.json()) as Array<{ workspace_id?: string }>;
      workspaceId = rows[0]?.workspace_id ?? "";
    }
    if (workspaceId) {
      await fetch(`${supabaseUrl}/rest/v1/workspaces?id=eq.${encodeURIComponent(workspaceId)}`, {
        method: "DELETE",
        headers: adminHeaders,
      });
    }
    if (actorId) {
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(actorId)}`, {
        method: "DELETE",
        headers: adminHeaders,
      });
    }
  }
});
