import {
  createRemoteJWKSet,
  customFetch,
  decodeProtectedHeader,
  errors as joseErrors,
  jwtVerify,
  type JWTPayload,
} from "jose";
import type { McpAuthMode } from "@aevum/mcp-protocol";

export interface AuthenticationIdentity {
  readonly subject: string;
  readonly email?: string;
  readonly type: "USER" | "SERVICE" | "AGENT";
  readonly tokenRoles: readonly string[];
  readonly provider: "SUPABASE" | "DEVELOPMENT";
}

export interface AuthVerifier {
  readonly mode: McpAuthMode;
  verify(authorization: string | undefined): Promise<AuthenticationIdentity>;
  readiness(): Promise<boolean>;
}

export class AuthenticationError extends Error {
  public readonly code: "REQUIRED" | "INVALID" | "EXPIRED";

  public constructor(code: "REQUIRED" | "INVALID" | "EXPIRED", message: string) {
    super(message);
    this.name = "AuthenticationError";
    this.code = code;
  }
}

function bearerToken(authorization: string | undefined): string {
  if (!authorization) throw new AuthenticationError("REQUIRED", "Bearer authentication is required.");
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match?.[1]) throw new AuthenticationError("INVALID", "Authorization must use one Bearer token.");
  return match[1];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function identityFromPayload(payload: JWTPayload): AuthenticationIdentity {
  if (!payload.sub) throw new AuthenticationError("INVALID", "Verified token is missing a subject.");
  if (typeof payload.exp !== "number") throw new AuthenticationError("INVALID", "Verified token is missing expiry.");
  const appMetadata = payload.app_metadata;
  const metadata = appMetadata && typeof appMetadata === "object" ? (appMetadata as Record<string, unknown>) : {};
  const role = typeof payload.role === "string" ? payload.role : undefined;
  return {
    subject: payload.sub,
    ...(typeof payload.email === "string" ? { email: payload.email } : {}),
    type: role === "service_role" ? "SERVICE" : "USER",
    tokenRoles: [...new Set([...(role ? [role] : []), ...stringArray(metadata.roles)])],
    provider: "SUPABASE",
  };
}

export interface SupabaseAuthVerifierOptions {
  readonly supabaseUrl: string;
  readonly jwtSecret?: string;
  readonly audience?: string;
  readonly fetch?: typeof fetch;
}

export function createSupabaseAuthVerifier(options: SupabaseAuthVerifierOptions): AuthVerifier {
  const issuer = `${options.supabaseUrl.replace(/\/$/, "")}/auth/v1`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
    ...(options.fetch ? { [customFetch]: options.fetch } : {}),
  });
  return Object.freeze({
    mode: "supabase" as const,
    async verify(authorization: string | undefined) {
      const token = bearerToken(authorization);
      try {
        const header = decodeProtectedHeader(token);
        if (!header.alg || !["HS256", "RS256", "ES256"].includes(header.alg)) {
          throw new AuthenticationError("INVALID", "Token signing algorithm is unsupported.");
        }
        const key =
          header.alg === "HS256" ? (options.jwtSecret ? new TextEncoder().encode(options.jwtSecret) : undefined) : jwks;
        if (!key) throw new AuthenticationError("INVALID", "HS256 verification is not configured.");
        const result = await jwtVerify(token, key, {
          issuer,
          audience: options.audience ?? "authenticated",
          algorithms: [header.alg],
        });
        return identityFromPayload(result.payload);
      } catch (error) {
        if (error instanceof AuthenticationError) throw error;
        if (error instanceof joseErrors.JWTExpired) {
          throw new AuthenticationError("EXPIRED", "Bearer token has expired.");
        }
        throw new AuthenticationError("INVALID", "Bearer token verification failed.");
      }
    },
    async readiness() {
      return Boolean(options.supabaseUrl && (options.jwtSecret || jwks));
    },
  });
}

export interface DevelopmentAuthVerifierOptions {
  readonly nodeEnv: "development" | "test" | "production";
  readonly subject?: string;
  readonly email?: string;
}

export function createDevelopmentAuthVerifier(options: DevelopmentAuthVerifierOptions): AuthVerifier {
  if (options.nodeEnv === "production") {
    throw new Error("Development authentication is prohibited in production.");
  }
  return Object.freeze({
    mode: "development" as const,
    async verify() {
      return {
        subject: options.subject ?? "development-actor",
        ...(options.email ? { email: options.email } : {}),
        type: "AGENT" as const,
        tokenRoles: ["development"],
        provider: "DEVELOPMENT" as const,
      };
    },
    async readiness() {
      return true;
    },
  });
}

export function createDisabledAuthVerifier(nodeEnv: "development" | "test" | "production"): AuthVerifier {
  if (nodeEnv === "production") throw new Error("Disabled authentication is prohibited in production.");
  return Object.freeze({
    mode: "disabled" as const,
    async verify() {
      return {
        subject: "disabled-auth",
        type: "SERVICE" as const,
        tokenRoles: [],
        provider: "DEVELOPMENT" as const,
      };
    },
    async readiness() {
      return true;
    },
  });
}
