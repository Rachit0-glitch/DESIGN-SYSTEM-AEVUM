import { createHmac } from "node:crypto";
import {
  createDevelopmentAuthVerifier,
  createDisabledAuthVerifier,
  createSupabaseAuthVerifier,
  redactSecrets,
} from "@aevum/mcp-server";
import { describe, expect, it } from "vitest";

const SECRET = "phase-12-test-signing-secret-with-sufficient-entropy";
const ISSUER = "https://phase12.supabase.co/auth/v1";

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function token(payload: Readonly<Record<string, unknown>>, secret = SECRET): string {
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}`;
  return `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
}

describe("MCP authentication and secret safety", () => {
  const verifier = createSupabaseAuthVerifier({ supabaseUrl: "https://phase12.supabase.co", jwtSecret: SECRET });

  it("accepts a cryptographically valid Supabase JWT and trusts only signed claims", async () => {
    const identity = await verifier.verify(
      `Bearer ${token({
        sub: "user-12",
        aud: "authenticated",
        iss: ISSUER,
        exp: Math.floor(Date.now() / 1_000) + 300,
        email: "phase12@example.com",
        role: "authenticated",
        app_metadata: { roles: ["agent"] },
      })}`,
    );

    expect(identity).toMatchObject({ subject: "user-12", provider: "SUPABASE", type: "USER" });
    expect(identity.tokenRoles).toEqual(["authenticated", "agent"]);
  });

  it("rejects missing, invalid, expired, wrong-audience, and wrong-issuer tokens", async () => {
    const now = Math.floor(Date.now() / 1_000);
    await expect(verifier.verify(undefined)).rejects.toMatchObject({ code: "REQUIRED" });
    await expect(
      verifier.verify(`Bearer ${token({ sub: "x", aud: "authenticated", iss: ISSUER, exp: now + 60 }, "wrong")}`),
    ).rejects.toMatchObject({ code: "INVALID" });
    await expect(
      verifier.verify(`Bearer ${token({ sub: "x", aud: "authenticated", iss: ISSUER, exp: now - 1 })}`),
    ).rejects.toMatchObject({ code: "EXPIRED" });
    await expect(
      verifier.verify(`Bearer ${token({ sub: "x", aud: "other", iss: ISSUER, exp: now + 60 })}`),
    ).rejects.toMatchObject({ code: "INVALID" });
    await expect(
      verifier.verify(
        `Bearer ${token({ sub: "x", aud: "authenticated", iss: "https://attacker.invalid", exp: now + 60 })}`,
      ),
    ).rejects.toMatchObject({ code: "INVALID" });
    await expect(
      verifier.verify(`Bearer ${token({ sub: "x", aud: "authenticated", iss: ISSUER })}`),
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  it("prohibits development and disabled authentication in production", () => {
    expect(() => createDevelopmentAuthVerifier({ nodeEnv: "production" })).toThrow(/prohibited/);
    expect(() => createDisabledAuthVerifier("production")).toThrow(/prohibited/);
  });

  it("redacts nested secrets, bearer tokens, and database credentials", () => {
    const redacted = redactSecrets({
      authorization: "Bearer aaa.bbb.ccc",
      nested: { serviceRoleKey: "secret", url: "postgresql://user:password@example.com/db" },
      safe: "visible",
    });
    expect(JSON.stringify(redacted)).not.toContain("password");
    expect(JSON.stringify(redacted)).not.toContain("aaa.bbb.ccc");
    expect(redacted).toMatchObject({ authorization: "[REDACTED]", safe: "visible" });
  });
});
