import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  CanonicalDesignDocumentSchema,
  createDocument,
  createFrame,
  createPage,
  createText,
  type CanonicalDesignDocument,
} from "@aevum/document-model";
import {
  createSupabaseProjectRepository,
  createWorkspaceId,
  type ProjectRepository,
  type StoredProjectRecord,
  type WorkspaceMembershipRecord,
} from "@aevum/project-store";
import type { AevumEnvironment } from "@aevum/shared";

export interface ApiActor {
  readonly subject: string;
  readonly email?: string;
}

export interface ApiBootstrapResult {
  readonly actor: ApiActor;
  readonly workspaces: readonly {
    readonly membership: WorkspaceMembershipRecord;
    readonly projects: readonly StoredProjectRecord[];
  }[];
}

export interface AevumApiRuntime {
  bootstrap(authorization: string | undefined, createIfMissing: boolean): Promise<ApiBootstrapResult>;
  readiness(): Promise<{
    readonly ok: boolean;
    readonly checks: Readonly<Record<string, boolean>>;
    readonly schemaVersion?: string;
  }>;
  close(): Promise<void>;
}

export class ApiRuntimeError extends Error {
  public constructor(
    public readonly code:
      | "AUTH_REQUIRED"
      | "AUTH_INVALID"
      | "ACCESS_DENIED"
      | "PAYLOAD_TOO_LARGE"
      | "PERSISTENCE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "ApiRuntimeError";
  }
}

function bearerToken(authorization: string | undefined): string {
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
  if (!match?.[1]) throw new ApiRuntimeError("AUTH_REQUIRED", "A valid Bearer session is required.");
  return match[1];
}

async function actorFor(client: SupabaseClient, authorization: string | undefined): Promise<ApiActor> {
  const { data, error } = await client.auth.getUser(bearerToken(authorization));
  if (error || !data.user) throw new ApiRuntimeError("AUTH_INVALID", "The Supabase session is invalid or expired.");
  return {
    subject: data.user.id,
    ...(data.user.email ? { email: data.user.email } : {}),
  };
}

async function resolveBootstrap(repository: ProjectRepository, actor: ApiActor): Promise<ApiBootstrapResult> {
  const memberships = await repository.listMemberships(actor.subject);
  const workspaces = await Promise.all(
    memberships.map(async (membership) => {
      const projects = await repository.listProjects(membership.workspaceId);
      const accessible = ["OWNER", "ADMIN", "SERVICE"].includes(membership.role)
        ? projects
        : projects.filter((project) => membership.projectIds.includes(project.id));
      return { membership, projects: accessible };
    }),
  );
  return { actor, workspaces };
}

export function createStarterDocument(actorSubject: string, now: string): CanonicalDesignDocument {
  const source = createDocument({ name: "Untitled AEVUM design", actorId: `supabase:${actorSubject}`, now });
  const page = createPage("Page 1");
  const frame = createFrame(page.id, "Desktop frame");
  const heading = createText(frame.id, "Start creating.", "Heading");
  return CanonicalDesignDocumentSchema.parse({
    ...source,
    rootNodeIds: [page.id],
    pages: [page.id],
    nodes: {
      [page.id]: { ...page, childIds: [frame.id] },
      [frame.id]: { ...frame, childIds: [heading.id] },
      [heading.id]: {
        ...heading,
        transform: { ...heading.transform, position: { x: 96, y: 96, z: 0 } },
        dimensions: {
          width: { value: 480, unit: "PX", mode: "FIXED" },
          height: { value: 72, unit: "PX", mode: "FIXED" },
        },
      },
    },
  });
}

export function createProductionApiRuntime(environment: AevumEnvironment): AevumApiRuntime {
  const url = environment.supabase.url;
  const serviceRoleKey = environment.supabase.serviceRoleKey;
  if (!url || !serviceRoleKey) throw new Error("Production API requires configured Supabase server credentials.");
  const authClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const repository = createSupabaseProjectRepository({ url, serviceRoleKey });

  const runtime: AevumApiRuntime = {
    async bootstrap(authorization, createIfMissing) {
      const actor = await actorFor(authClient, authorization);
      let result = await resolveBootstrap(repository, actor);
      if (result.workspaces.length > 0 || !createIfMissing) return result;

      const now = new Date().toISOString();
      const document = createStarterDocument(actor.subject, now);
      const workspaceId = createWorkspaceId();
      const project: StoredProjectRecord = {
        id: document.metadata.projectId,
        workspaceId,
        name: "My first AEVUM project",
        status: "ACTIVE",
        currentDocumentId: document.metadata.id,
        currentDocumentVersion: document.documentVersion,
        updatedAt: now,
      };
      try {
        await repository.bootstrapProject({
          workspaceId,
          workspaceName: actor.email ? `${actor.email.split("@")[0]}'s workspace` : "My AEVUM workspace",
          actorSubject: actor.subject,
          project,
          document,
        });
      } catch {
        result = await resolveBootstrap(repository, actor);
        if (result.workspaces.length === 0) {
          throw new ApiRuntimeError("PERSISTENCE_FAILED", "The initial project could not be created safely.");
        }
        return result;
      }
      return resolveBootstrap(repository, actor);
    },
    async readiness() {
      const readiness = await repository.readiness();
      return {
        ok: readiness.ok,
        checks: { ...readiness.checks, authentication: true },
        ...(readiness.schemaVersion ? { schemaVersion: readiness.schemaVersion } : {}),
      };
    },
    async close() {
      await repository.close();
    },
  };
  return Object.freeze(runtime);
}
