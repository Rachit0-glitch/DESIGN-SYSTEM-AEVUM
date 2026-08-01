import type { EntityId } from "./ids.js";
import { createEntityId } from "./ids.js";
import {
  CURRENT_MIGRATION_VERSION,
  CURRENT_SCHEMA_VERSION,
  type AssetRecord,
  type CanonicalDesignDocument,
  type DesignNode,
  type TextStyle,
  type Transform,
} from "./schema.js";

const px = (value: number) => ({ value, unit: "PX" as const, mode: "FIXED" as const });

export function createTransform(): Transform {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    skew: { x: 0, y: 0 },
    anchor: { x: 0, y: 0 },
    pivot: { x: 0, y: 0, z: 0 },
    opacity: 1,
    clipping: false,
    maskIds: [],
    coordinateSpace: "LOCAL",
  };
}

const nodeBase = (id: EntityId, name: string, parentId: string | null) => ({
  id,
  name,
  parentId,
  childIds: [],
  visible: true,
  locked: false,
  transform: createTransform(),
  sourceLinks: [],
  metadata: { tags: [], customData: {} },
});

export interface CreateDocumentOptions {
  readonly name?: string;
  readonly description?: string;
  readonly actorId?: string;
  readonly now?: string;
  readonly projectId?: EntityId<"project">;
}

export function createDocument(options: CreateDocumentOptions = {}): CanonicalDesignDocument {
  const now = options.now ?? new Date().toISOString();
  const viewportId = createEntityId("viewport");
  const actor = { id: options.actorId ?? "system", type: "SYSTEM" as const, displayName: "AEVUM" };
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    migrationVersion: CURRENT_MIGRATION_VERSION,
    documentVersion: 1,
    parentVersionId: null,
    metadata: {
      id: createEntityId("doc"),
      projectId: options.projectId ?? createEntityId("project"),
      name: options.name ?? "Untitled",
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
      version: 1,
      projectVersion: 1,
      tags: [],
      description: options.description ?? "",
    },
    rootNodeIds: [],
    pages: [],
    nodes: {},
    assets: {},
    components: {},
    tokens: {},
    typography: {},
    timelines: {},
    cameras: {},
    lights: {},
    materials: {},
    references: {},
    validations: {},
    exports: {},
    settings: {
      qualityMode: "MAXIMUM_FIDELITY",
      defaultViewportId: viewportId,
      viewports: {
        [viewportId]: {
          id: viewportId,
          name: "Desktop",
          width: 1440,
          height: 900,
          deviceScaleFactor: 1,
          orientation: "LANDSCAPE",
          category: "DESKTOP",
        },
      },
      defaultColorSpace: "SRGB",
      defaultUnit: "PX",
      frameRate: 60,
      deterministicSeed: 1,
      reducedMotion: "PRESERVE",
    },
  };
}

export function createPage(name = "Page"): Extract<DesignNode, { type: "PAGE" }> {
  return { ...nodeBase(createEntityId("page"), name, null), type: "PAGE", pageKind: "WEB" };
}

export function createFrame(parentId: string, name = "Frame"): Extract<DesignNode, { type: "FRAME" }> {
  return {
    ...nodeBase(createEntityId("frame"), name, parentId),
    type: "FRAME",
    dimensions: { width: px(1440), height: px(900) },
    layout: { type: "ABSOLUTE" },
  };
}

export function defaultTextStyle(): TextStyle {
  return {
    fontFamily: "Inter",
    fallbackFamilies: ["Arial", "sans-serif"],
    fontMatchStatus: "CLOSE_SUBSTITUTE",
    size: px(16),
    lineHeight: { multiplier: 1.5 },
    letterSpacing: px(0),
    weight: 400,
    style: "NORMAL",
    variableAxes: {},
    openTypeFeatures: {},
  };
}

export function createText(parentId: string, content: string, name = "Text"): Extract<DesignNode, { type: "TEXT" }> {
  const style = defaultTextStyle();
  return {
    ...nodeBase(createEntityId("text"), name, parentId),
    type: "TEXT",
    content,
    runs: content.length === 0 ? [] : [{ start: 0, end: content.length, style }],
    paragraphStyle: {
      alignment: "LEFT",
      verticalAlignment: "TOP",
      direction: "AUTO",
      paragraphSpacingBefore: px(0),
      paragraphSpacingAfter: px(0),
      firstLineIndent: px(0),
      hangingIndent: px(0),
    },
  };
}

export interface CreateAssetOptions {
  readonly type: AssetRecord["type"];
  readonly name: string;
  readonly hash: string;
  readonly uri: string;
  readonly mimeType: string;
  readonly byteSize?: number;
}

export function createAsset(options: CreateAssetOptions): AssetRecord {
  return {
    id: createEntityId("asset"),
    type: options.type,
    name: options.name,
    hash: options.hash,
    source: { kind: "UPLOAD", uri: options.uri },
    mimeType: options.mimeType,
    byteSize: options.byteSize ?? 0,
    metadata: {},
  };
}
