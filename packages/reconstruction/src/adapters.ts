import { readAssetMetadata, type AevumAssetMetadata, type QuarantineIssue } from "@aevum/assets";
import type { AssetRecord } from "@aevum/document-model";
import type { TypographyStyleResolver } from "@aevum/typography";
import type {
  AssetCandidate,
  ComponentCandidate,
  DetectedRegion,
  LayoutCandidate,
  ReconstructionManifest,
  ReconstructionManifestRegion,
  ReconstructionTask,
  ShapeCandidate,
  TextCandidate,
  TokenCandidate,
} from "./schemas.js";

export type ResolvedSourceAsset =
  | { readonly kind: "READY"; readonly asset: AssetRecord; readonly metadata: AevumAssetMetadata }
  | { readonly kind: "MISSING"; readonly assetId: string }
  | { readonly kind: "QUARANTINED"; readonly assetId: string; readonly issues: readonly QuarantineIssue[] }
  | { readonly kind: "INVALID"; readonly asset: AssetRecord; readonly reason: string };

export interface ReconstructionAssetResolver {
  resolve(assetId: string): ResolvedSourceAsset;
}

export interface ReconstructionAnalysisContext {
  readonly task: ReconstructionTask;
  readonly source: Extract<ResolvedSourceAsset, { kind: "READY" }>;
  readonly manifest?: ReconstructionManifest;
}

export interface RegionDetectionAdapter {
  readonly id: string;
  readonly version: string;
  detect(context: ReconstructionAnalysisContext): readonly ReconstructionManifestRegion[];
}

export interface TextDetectionAdapter {
  readonly id: string;
  readonly version: string;
  detect(context: ReconstructionAnalysisContext, regions: readonly DetectedRegion[]): readonly TextCandidate[];
}

export interface LayoutInferenceAdapter {
  readonly id: string;
  readonly version: string;
  infer(context: ReconstructionAnalysisContext, regions: readonly DetectedRegion[]): readonly LayoutCandidate[];
}

export interface AssetExtractionAdapter {
  readonly id: string;
  readonly version: string;
  inspect(context: ReconstructionAnalysisContext, regions: readonly DetectedRegion[]): readonly AssetCandidate[];
}

export interface ShapeInferenceAdapter {
  readonly id: string;
  readonly version: string;
  infer(context: ReconstructionAnalysisContext, regions: readonly DetectedRegion[]): readonly ShapeCandidate[];
}

export interface ComponentDetectionAdapter {
  readonly id: string;
  readonly version: string;
  detect(context: ReconstructionAnalysisContext, regions: readonly DetectedRegion[]): readonly ComponentCandidate[];
}

export interface TokenInferenceAdapter {
  readonly id: string;
  readonly version: string;
  infer(context: ReconstructionAnalysisContext, regions: readonly DetectedRegion[]): readonly TokenCandidate[];
}

export interface ReconstructionAdapters {
  readonly regions: RegionDetectionAdapter;
  readonly text: TextDetectionAdapter;
  readonly layout: LayoutInferenceAdapter;
  readonly assets: AssetExtractionAdapter;
  readonly shapes: ShapeInferenceAdapter;
  readonly components: ComponentDetectionAdapter;
  readonly tokens: TokenInferenceAdapter;
  readonly typography?: TypographyStyleResolver;
}

export function createAssetRegistryResolver(
  registry: Readonly<Record<string, AssetRecord>>,
  quarantined: Readonly<Record<string, readonly QuarantineIssue[]>> = {},
): ReconstructionAssetResolver {
  return Object.freeze({
    resolve(assetId: string): ResolvedSourceAsset {
      const issues = quarantined[assetId];
      if (issues) return { kind: "QUARANTINED", assetId, issues };
      const asset = registry[assetId];
      if (!asset) return { kind: "MISSING", assetId };
      try {
        return { kind: "READY", asset, metadata: readAssetMetadata(asset) };
      } catch (error) {
        return { kind: "INVALID", asset, reason: error instanceof Error ? error.message : "Invalid asset metadata." };
      }
    },
  });
}
