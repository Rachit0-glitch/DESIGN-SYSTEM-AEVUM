import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260802000100_create_mcp_foundation.sql", "utf8");
const maintenanceMigration = readFileSync("supabase/migrations/20260809000100_enable_mcp_audit_retention.sql", "utf8");

describe("MCP Supabase migration", () => {
  it("creates canonical persistence, audit, version, membership, and idempotency tables", () => {
    for (const table of [
      "workspace_memberships",
      "projects",
      "documents",
      "document_versions",
      "mcp_audit_logs",
      "mcp_idempotency_records",
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
    }
  });

  it("enables RLS, denies client roles, and restricts atomic commit execution to service_role", () => {
    expect(migration.match(/enable row level security/g)).toHaveLength(8);
    expect(migration.match(/revoke all on public\.[a-z_]+ from anon, authenticated/g)).toHaveLength(8);
    expect(migration).toContain("security definer");
    expect(migration).toContain("revoke all on function public.aevum_mcp_commit_document");
    expect(migration).toContain("grant execute on function public.aevum_mcp_commit_document");
    expect(migration).toContain("to service_role");
  });

  it("keeps audit mutation client-denied while allowing trusted retention cleanup", () => {
    expect(migration).toContain("revoke all on public.mcp_audit_logs from anon, authenticated");
    expect(maintenanceMigration).toContain("grant delete on public.mcp_audit_logs to service_role");
    expect(maintenanceMigration).not.toMatch(/grant delete .* (anon|authenticated)/);
  });
});
