/**
 * Wraps @aevum/reconstruction-vision's real, local, free pixel analysis (sharp decode + color-
 * cluster segmentation + two-pass tesseract.js OCR) behind the same VisionProvider interface the
 * Google Cloud Vision adapter satisfies. This keeps LOCAL a genuine, working fallback/test
 * provider — not a vestigial stub — and lets every consumer (manifest conversion, caching, MCP
 * wiring) stay provider-agnostic.
 */
import sharp from "sharp";
import { createOcrSession, segmentForeground } from "@aevum/reconstruction-vision";
import {
  VisionProviderError,
  type VisionAnalysis,
  type VisionAnalyzeOptions,
  type VisionObjectRegion,
  type VisionPoint,
  type VisionProvider,
  type VisionTextBlock,
} from "./types.js";
import { requestFingerprint } from "./cache.js";

export const LOCAL_VISION_ADAPTER_VERSION = "1.0.0" as const;

function rectPoly(x: number, y: number, width: number, height: number): readonly VisionPoint[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

export interface CreateLocalVisionProviderOptions {
  readonly ocrCacheDir?: string;
  readonly workingMaxEdge?: number;
}

export function createLocalVisionProvider(options: CreateLocalVisionProviderOptions = {}): VisionProvider {
  return Object.freeze({
    id: "LOCAL" as const,
    version: LOCAL_VISION_ADAPTER_VERSION,
    async analyzeImage(bytes: Uint8Array, analyzeOptions: VisionAnalyzeOptions): Promise<VisionAnalysis> {
      const source = sharp(Buffer.from(bytes));
      const metadata = await source.metadata();
      const width = metadata.width ?? 0;
      const height = metadata.height ?? 0;
      // Matches manifest-builder.ts's own guard for the same failure mode (a real image sharp
      // could decode but report no usable dimensions for) -- without this, a 0x0 PAGE node could
      // silently validate downstream (Block H14 finding).
      if (width <= 0 || height <= 0) {
        throw new VisionProviderError("VISION_PROVIDER_INVALID_IMAGE", "Could not determine source image dimensions.");
      }

      const workingMaxEdge = options.workingMaxEdge ?? 480;
      const scale = Math.min(1, workingMaxEdge / Math.max(width || 1, height || 1));
      const workingWidth = Math.max(1, Math.round(width * scale));
      const workingHeight = Math.max(1, Math.round(height * scale));
      const { data } = await source
        .clone()
        .resize(workingWidth, workingHeight, { fit: "fill" })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const segmentation = segmentForeground({
        data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
        width: workingWidth,
        height: workingHeight,
      });
      const toSourceScale = (value: number): number => value / scale;
      const objects: VisionObjectRegion[] = segmentation.blobs.map((blob, index) => ({
        name: `local-region-${index}`,
        score: Math.min(0.8, 0.3 + blob.fillRatio * 0.5),
        boundingPoly: {
          vertices: rectPoly(
            toSourceScale(blob.minX),
            toSourceScale(blob.minY),
            toSourceScale(blob.maxX - blob.minX),
            toSourceScale(blob.maxY - blob.minY),
          ),
        },
      }));

      const warnings: string[] = [];
      let textBlocks: readonly VisionTextBlock[] = [];
      const ocrSession = await createOcrSession(options.ocrCacheDir ? { cacheDir: options.ocrCacheDir } : {});
      try {
        const lines = await ocrSession.recognizeLines(bytes);
        if (lines.length === 0) warnings.push("Local OCR found no text lines in this image.");
        const paragraphBlocks: VisionTextBlock[] = lines.map((line, index) => ({
          id: `local.p${index}`,
          level: "PARAGRAPH",
          text: line.text,
          boundingPoly: {
            vertices: rectPoly(line.bbox.x0, line.bbox.y0, line.bbox.x1 - line.bbox.x0, line.bbox.y1 - line.bbox.y0),
          },
          confidence: Math.min(1, Math.max(0, line.confidence / 100)),
          languageHints: [],
          children: [],
        }));
        textBlocks = [
          {
            id: "local.page0",
            level: "PAGE",
            text: paragraphBlocks.map((block) => block.text).join("\n"),
            boundingPoly: { vertices: [] },
            confidence: 1,
            languageHints: [],
            children: paragraphBlocks,
          },
        ];
      } finally {
        await ocrSession.close();
      }

      return {
        provider: {
          providerId: "LOCAL",
          providerVersion: LOCAL_VISION_ADAPTER_VERSION,
          sourceHash: analyzeOptions.sourceHash,
          requestFingerprint: requestFingerprint("LOCAL", analyzeOptions),
          analyzedAt: new Date().toISOString(),
          cached: false,
        },
        imageWidth: width,
        imageHeight: height,
        textBlocks,
        labels: [],
        objects,
        warnings,
      };
    },
  });
}
