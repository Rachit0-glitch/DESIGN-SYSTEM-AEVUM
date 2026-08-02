import type { AssetRecord, CanonicalDesignDocument, DesignNode, Transform } from "@aevum/document-model";

export const SCENE_PROJECTION_VERSION = "1.0.0" as const;

export type RuntimeQualityMode = CanonicalDesignDocument["settings"]["qualityMode"];
export type RuntimeOrientation = "PORTRAIT" | "LANDSCAPE";
export type RuntimeDeviceCategory = "DESKTOP" | "TABLET" | "MOBILE" | "CUSTOM";

export interface RuntimeViewport {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor: number;
  readonly orientation: RuntimeOrientation;
  readonly category: RuntimeDeviceCategory;
  readonly reducedMotion: boolean;
  readonly breakpointId?: string;
  readonly containerQueryIds?: readonly string[];
  readonly qualityMode?: RuntimeQualityMode;
}

export interface SceneRuntimeConfiguration {
  readonly strictMode: boolean;
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly enableCache: boolean;
  readonly cacheSize: number;
  readonly diagnostics: boolean;
  readonly inspectionMode: boolean;
}

export type RuntimeDiagnosticSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";
export type RuntimeDiagnosticCode =
  | "DOCUMENT_SCHEMA_INVALID"
  | "MISSING_ROOT"
  | "DUPLICATE_ROOT"
  | "MISSING_NODE"
  | "MISSING_PARENT"
  | "MISSING_CHILD"
  | "PARENT_CHILD_MISMATCH"
  | "CYCLE_DETECTED"
  | "UNREACHABLE_NODE"
  | "MISSING_ASSET"
  | "MISSING_TOKEN"
  | "MISSING_COMPONENT"
  | "COMPONENT_RECURSION"
  | "MISSING_TIMELINE"
  | "TIMELINE_TARGET_MISSING"
  | "UNSORTED_KEYFRAMES"
  | "MISSING_CAMERA"
  | "MISSING_LIGHT"
  | "MISSING_MATERIAL"
  | "INVALID_RESPONSIVE_OVERRIDE"
  | "INVALID_TRANSFORM"
  | "MAX_DEPTH_EXCEEDED"
  | "MAX_NODE_COUNT_EXCEEDED"
  | "UNSUPPORTED_SCHEMA_VERSION";

export interface RuntimeDiagnostic {
  readonly code: RuntimeDiagnosticCode;
  readonly severity: RuntimeDiagnosticSeverity;
  readonly message: string;
  readonly entityId?: string;
  readonly entityType?: string;
  readonly relatedIds?: readonly string[];
  readonly path?: string;
  readonly recoverable: boolean;
  readonly suggestedAction?: string;
}

export type RuntimeReachability = "REACHABLE" | "UNREACHABLE" | "MISSING_REFERENCE" | "INVALID_HIERARCHY";

export interface RuntimeTransform extends Transform {
  readonly matrix: readonly number[];
}

export interface RuntimeResponsiveData {
  readonly appliedOverrideKeys: readonly string[];
  readonly skippedOverrideKeys: readonly string[];
  readonly changedPaths: readonly string[];
}

export interface RuntimeReference<T> {
  readonly id: string;
  readonly resolved: boolean;
  readonly value?: Readonly<T>;
}

export interface RuntimeResolvedReferences {
  readonly assets: readonly RuntimeReference<AssetRecord>[];
  readonly fonts: readonly RuntimeReference<AssetRecord>[];
  readonly tokens: readonly RuntimeReference<CanonicalDesignDocument["tokens"][string]>[];
  readonly components: readonly RuntimeReference<CanonicalDesignDocument["components"][string]>[];
  readonly timelines: readonly RuntimeReference<CanonicalDesignDocument["timelines"][string]>[];
  readonly materials: readonly RuntimeReference<CanonicalDesignDocument["materials"][string]>[];
  readonly cameras: readonly RuntimeReference<CanonicalDesignDocument["cameras"][string]>[];
  readonly lights: readonly RuntimeReference<CanonicalDesignDocument["lights"][string]>[];
}

export interface RuntimeComponentOrigin {
  readonly instanceId: string;
  readonly componentId: string;
  readonly sourceNodeId: string;
  readonly variantId?: string;
  readonly overrides: Readonly<Record<string, unknown>>;
}

export interface RuntimeNode {
  readonly id: string;
  readonly type: DesignNode["type"];
  readonly name: string;
  readonly parentId?: string;
  readonly childIds: readonly string[];
  readonly depth: number;
  readonly traversalIndex: number;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly effectiveOpacity: number;
  readonly localTransform: RuntimeTransform;
  readonly worldTransform: RuntimeTransform;
  readonly dimensions?: DesignNode["dimensions"];
  readonly constraints?: DesignNode["constraints"];
  readonly layout?: Extract<DesignNode, { type: "FRAME" }>["layout"];
  readonly responsive: RuntimeResponsiveData;
  readonly resolvedReferences: RuntimeResolvedReferences;
  readonly componentOrigin?: RuntimeComponentOrigin;
  readonly sourceNode: Readonly<DesignNode>;
}

export type RuntimeDependencyType =
  | "NODE_PARENT"
  | "NODE_CHILD"
  | "USES_ASSET"
  | "USES_FONT"
  | "USES_TOKEN"
  | "USES_COMPONENT"
  | "USES_TIMELINE"
  | "USES_MATERIAL"
  | "USES_TEXTURE"
  | "USES_CAMERA"
  | "USES_LIGHT"
  | "TARGETS_NODE";

export interface RuntimeDependencyEdge {
  readonly fromId: string;
  readonly toId: string;
  readonly type: RuntimeDependencyType;
}

export interface RuntimeDependencyGraph {
  readonly edges: readonly RuntimeDependencyEdge[];
  readonly outgoing: ReadonlyMap<string, readonly RuntimeDependencyEdge[]>;
  readonly incoming: ReadonlyMap<string, readonly RuntimeDependencyEdge[]>;
}

export interface RuntimeProjectionStatistics {
  readonly totalCanonicalNodes: number;
  readonly reachableNodes: number;
  readonly unreachableNodes: number;
  readonly runtimeProjectedNodes: number;
  readonly maximumDepth: number;
  readonly assetReferences: number;
  readonly componentInstances: number;
  readonly timelineReferences: number;
  readonly twoDimensionalNodes: number;
  readonly threeDimensionalNodes: number;
  readonly warningCount: number;
  readonly errorCount: number;
  readonly criticalCount: number;
  readonly projectionDurationMs: number;
}

export interface SceneProjectionResult {
  readonly documentId: string;
  readonly documentVersion: number;
  readonly schemaVersion: string;
  readonly projectionVersion: string;
  readonly viewport: RuntimeViewport;
  readonly qualityMode: RuntimeQualityMode;
  readonly rootIds: readonly string[];
  readonly nodes: ReadonlyMap<string, RuntimeNode>;
  readonly reachability: ReadonlyMap<string, RuntimeReachability>;
  readonly dependencyGraph: RuntimeDependencyGraph;
  readonly diagnostics: readonly RuntimeDiagnostic[];
  readonly statistics: RuntimeProjectionStatistics;
  readonly fingerprint: string;
  readonly complete: boolean;
}
