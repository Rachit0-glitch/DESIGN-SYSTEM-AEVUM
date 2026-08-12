import { randomUUID } from "node:crypto";
import { z } from "zod";

export const ENTITY_ID_PREFIXES = [
  "doc",
  "project",
  "node",
  "page",
  "frame",
  "group",
  "text",
  "shape",
  "image",
  "video",
  "svg",
  "vector",
  "canvas",
  "webgl",
  "scene",
  "model",
  "mesh",
  "asset",
  "component",
  "variant",
  "slot",
  "token",
  "type",
  "timeline",
  "track",
  "keyframe",
  "clip",
  "marker",
  "trigger",
  "event",
  "state",
  "transition",
  "machine",
  "camera",
  "light",
  "environment",
  "lighting",
  "profile",
  "probe",
  "bake",
  "material",
  "reference",
  "validation",
  "export",
  "artifact",
  "viewport",
  "rig",
  "bone",
  "constraint",
] as const;

export type EntityIdPrefix = (typeof ENTITY_ID_PREFIXES)[number];
export type EntityId<P extends EntityIdPrefix = EntityIdPrefix> = `${P}_${string}`;

const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const entityIdPattern = new RegExp(`^(?:${ENTITY_ID_PREFIXES.join("|")})_${uuidPattern}$`, "i");

export const EntityIdSchema = z.string().regex(entityIdPattern, "Expected a stable prefixed UUID entity ID");

export function createEntityId<P extends EntityIdPrefix>(prefix: P): EntityId<P> {
  return `${prefix}_${randomUUID()}`;
}

export function hasEntityIdPrefix(id: string, prefix: EntityIdPrefix): boolean {
  return id.startsWith(`${prefix}_`);
}
