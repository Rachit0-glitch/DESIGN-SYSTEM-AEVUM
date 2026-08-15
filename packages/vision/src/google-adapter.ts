/**
 * Real Google Cloud Vision adapter. Uses the official `@google-cloud/vision` SDK's
 * `annotateImage` (DOCUMENT_TEXT_DETECTION + LABEL_DETECTION + OBJECT_LOCALIZATION +
 * IMAGE_PROPERTIES in one request) and normalizes the response into the provider-neutral
 * VisionAnalysis shape — no Google-specific type ever leaves this file.
 *
 * Credentials are never hardcoded and never read from Studio/browser code: this module only runs
 * server-side (apps/mcp-server). By default it uses the SDK's own Application Default Credentials
 * resolution (GOOGLE_APPLICATION_CREDENTIALS, a workload identity, etc.); explicit service-account
 * credentials can be injected for deployments that inject them as discrete env vars instead of a
 * credentials file.
 */
import { ImageAnnotatorClient, type protos } from "@google-cloud/vision";
import {
  VisionProviderError,
  type VisionAnalysis,
  type VisionAnalyzeOptions,
  type VisionBoundingPoly,
  type VisionDominantColor,
  type VisionImageProperties,
  type VisionLabel,
  type VisionObjectRegion,
  type VisionPoint,
  type VisionProvider,
  type VisionTextBlock,
} from "./types.js";
import { requestFingerprint } from "./cache.js";

export const GOOGLE_VISION_ADAPTER_VERSION = "1.0.0" as const;

type AnnotateImageResponse = protos.google.cloud.vision.v1.IAnnotateImageResponse;
/** Exported for test mocks that need to construct a response shape without importing the SDK's proto types directly. */
export type GoogleVisionAnnotateResponse = AnnotateImageResponse;
type IPage = protos.google.cloud.vision.v1.IPage;
type IBlock = protos.google.cloud.vision.v1.IBlock;
type IParagraph = protos.google.cloud.vision.v1.IParagraph;
type IWord = protos.google.cloud.vision.v1.IWord;
type ISymbol = protos.google.cloud.vision.v1.ISymbol;
type IBoundingPoly = protos.google.cloud.vision.v1.IBoundingPoly;

export interface GoogleVisionAnnotateRequest {
  readonly image: { readonly content: Uint8Array };
  readonly features: readonly { readonly type: string; readonly maxResults?: number }[];
  readonly imageContext?: { readonly languageHints: readonly string[] };
}

/** The one method this adapter actually calls — narrow on purpose so it's trivially mockable. */
export interface GoogleVisionClient {
  annotateImage(request: GoogleVisionAnnotateRequest): Promise<[AnnotateImageResponse, ...unknown[]]>;
}

export interface GoogleServiceAccountCredentials {
  readonly clientEmail: string;
  readonly privateKey: string;
  readonly projectId?: string;
}

export interface CreateGoogleVisionProviderOptions {
  /** Explicit service-account credentials (e.g. sourced from discrete env vars). */
  readonly credentials?: GoogleServiceAccountCredentials;
  /** Injectable for tests; production callers should omit this and let the SDK construct one. */
  readonly client?: GoogleVisionClient;
  readonly timeoutMs?: number;
  readonly maxLabels?: number;
  readonly maxObjects?: number;
}

function toPoly(poly: IBoundingPoly | null | undefined): VisionBoundingPoly {
  const vertices: VisionPoint[] = (poly?.vertices ?? []).map((vertex) => ({
    x: vertex.x ?? 0,
    y: vertex.y ?? 0,
  }));
  return { vertices };
}

/** Concatenates a word's symbol text, honoring Google's per-symbol detected-break hints. */
function wordText(word: IWord): string {
  return (word.symbols ?? [])
    .map((symbol) => {
      const breakType = symbol.property?.detectedBreak?.type;
      const text = symbol.text ?? "";
      if (breakType === "SPACE" || breakType === "SURE_SPACE") return `${text} `;
      if (breakType === "EOL_SURE_SPACE" || breakType === "LINE_BREAK") return `${text}\n`;
      if (breakType === "HYPHEN") return `${text}-`;
      return text;
    })
    .join("");
}

function symbolBlock(symbol: ISymbol, id: string): VisionTextBlock {
  return {
    id,
    level: "SYMBOL",
    text: symbol.text ?? "",
    boundingPoly: toPoly(symbol.boundingBox),
    confidence: symbol.confidence ?? 0,
    languageHints: [],
    children: [],
  };
}

function wordBlock(word: IWord, id: string): VisionTextBlock {
  const symbols = (word.symbols ?? []).map((symbol, index) => symbolBlock(symbol, `${id}.s${index}`));
  return {
    id,
    level: "WORD",
    text: wordText(word).trim(),
    boundingPoly: toPoly(word.boundingBox),
    confidence: word.confidence ?? 0,
    languageHints: [],
    children: symbols,
  };
}

function paragraphBlock(paragraph: IParagraph, id: string): VisionTextBlock {
  const words = (paragraph.words ?? []).map((word, index) => wordBlock(word, `${id}.w${index}`));
  return {
    id,
    level: "PARAGRAPH",
    text: words.map((word) => word.text).join(" "),
    boundingPoly: toPoly(paragraph.boundingBox),
    confidence: paragraph.confidence ?? 0,
    languageHints: [],
    children: words,
  };
}

function blockBlock(block: IBlock, id: string): VisionTextBlock {
  const paragraphs = (block.paragraphs ?? []).map((paragraph, index) => paragraphBlock(paragraph, `${id}.p${index}`));
  return {
    id,
    level: "BLOCK",
    text: paragraphs.map((paragraph) => paragraph.text).join("\n"),
    boundingPoly: toPoly(block.boundingBox),
    confidence: block.confidence ?? 0,
    languageHints: [],
    children: paragraphs,
  };
}

function pageBlock(page: IPage, id: string): VisionTextBlock {
  const blocks = (page.blocks ?? []).map((block, index) => blockBlock(block, `${id}.b${index}`));
  return {
    id,
    level: "PAGE",
    text: blocks.map((block) => block.text).join("\n"),
    boundingPoly: { vertices: [] },
    confidence: page.confidence ?? 0,
    languageHints: [],
    children: blocks,
  };
}

function normalizeTextBlocks(response: AnnotateImageResponse): readonly VisionTextBlock[] {
  const pages = response.fullTextAnnotation?.pages ?? [];
  return pages.map((page, index) => pageBlock(page, `page${index}`));
}

function normalizeLabels(response: AnnotateImageResponse): readonly VisionLabel[] {
  return (response.labelAnnotations ?? []).map((entry) => ({
    description: entry.description ?? "",
    score: entry.score ?? 0,
    ...(entry.topicality !== undefined && entry.topicality !== null ? { topicality: entry.topicality } : {}),
  }));
}

function normalizeObjects(
  response: AnnotateImageResponse,
  width: number,
  height: number,
): readonly VisionObjectRegion[] {
  return (response.localizedObjectAnnotations ?? []).map((entry) => {
    // Object localization returns normalized (0-1) vertices; convert to absolute source pixels so
    // every VisionBoundingPoly in this package uses the same absolute-pixel coordinate space.
    const vertices: VisionPoint[] = (entry.boundingPoly?.normalizedVertices ?? []).map((vertex) => ({
      x: (vertex.x ?? 0) * width,
      y: (vertex.y ?? 0) * height,
    }));
    return { name: entry.name ?? "", score: entry.score ?? 0, boundingPoly: { vertices } };
  });
}

function normalizeImageProperties(response: AnnotateImageResponse): VisionImageProperties | undefined {
  const colors = response.imagePropertiesAnnotation?.dominantColors?.colors;
  if (!colors) return undefined;
  const dominantColors: VisionDominantColor[] = colors.map((entry) => ({
    r: Math.round((entry.color?.red ?? 0) * 255),
    g: Math.round((entry.color?.green ?? 0) * 255),
    b: Math.round((entry.color?.blue ?? 0) * 255),
    score: entry.score ?? 0,
    pixelFraction: entry.pixelFraction ?? 0,
  }));
  return { dominantColors };
}

export function createGoogleVisionProvider(options: CreateGoogleVisionProviderOptions = {}): VisionProvider {
  const client: GoogleVisionClient =
    options.client ??
    new ImageAnnotatorClient(
      options.credentials
        ? {
            credentials: { client_email: options.credentials.clientEmail, private_key: options.credentials.privateKey },
            ...(options.credentials.projectId ? { projectId: options.credentials.projectId } : {}),
          }
        : {},
    );
  const timeoutMs = options.timeoutMs ?? 15_000;

  return Object.freeze({
    id: "GOOGLE_CLOUD" as const,
    version: GOOGLE_VISION_ADAPTER_VERSION,
    async analyzeImage(bytes: Uint8Array, analyzeOptions: VisionAnalyzeOptions): Promise<VisionAnalysis> {
      const timeoutController = new AbortController();
      const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
      let response: AnnotateImageResponse;
      try {
        const [result] = await client.annotateImage({
          image: { content: bytes },
          features: [
            { type: "DOCUMENT_TEXT_DETECTION" },
            { type: "LABEL_DETECTION", maxResults: analyzeOptions.maxLabels ?? 10 },
            { type: "OBJECT_LOCALIZATION", maxResults: analyzeOptions.maxObjects ?? 10 },
            { type: "IMAGE_PROPERTIES" },
          ],
          ...(analyzeOptions.languageHints?.length
            ? { imageContext: { languageHints: [...analyzeOptions.languageHints] } }
            : {}),
        });
        response = result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.toLowerCase().includes("quota") || message.toLowerCase().includes("resource_exhausted")) {
          throw new VisionProviderError("VISION_PROVIDER_QUOTA_EXCEEDED", "Google Cloud Vision quota exceeded.");
        }
        if (
          message.toLowerCase().includes("permission") ||
          message.toLowerCase().includes("unauthenticated") ||
          message.toLowerCase().includes("credential")
        ) {
          throw new VisionProviderError("VISION_PROVIDER_AUTH_FAILED", "Google Cloud Vision authentication failed.");
        }
        throw new VisionProviderError("VISION_PROVIDER_UNAVAILABLE", `Google Cloud Vision request failed: ${message}`);
      } finally {
        clearTimeout(timer);
      }
      if (response.error) {
        throw new VisionProviderError(
          "VISION_PROVIDER_RESPONSE_INVALID",
          response.error.message ?? "Google Cloud Vision returned an error response.",
        );
      }

      // Vision's annotate response doesn't include the source image's own pixel dimensions
      // directly; derive a bound from the full-page text annotation when present, otherwise the
      // caller-supplied context (packages/reconstruction-vision already decodes real dimensions
      // via sharp before calling any provider) is the source of truth.
      const firstPage = response.fullTextAnnotation?.pages?.[0];
      const width = firstPage?.width ?? 0;
      const height = firstPage?.height ?? 0;

      const warnings: string[] = [];
      if (!response.fullTextAnnotation)
        warnings.push("Google Cloud Vision returned no text annotation for this image.");
      const imageProperties = normalizeImageProperties(response);

      return {
        provider: {
          providerId: "GOOGLE_CLOUD",
          providerVersion: GOOGLE_VISION_ADAPTER_VERSION,
          sourceHash: analyzeOptions.sourceHash,
          requestFingerprint: requestFingerprint("GOOGLE_CLOUD", analyzeOptions),
          analyzedAt: new Date().toISOString(),
          cached: false,
        },
        imageWidth: width,
        imageHeight: height,
        textBlocks: normalizeTextBlocks(response),
        labels: normalizeLabels(response),
        objects: normalizeObjects(response, width, height),
        ...(imageProperties ? { imageProperties } : {}),
        warnings,
      };
    },
  });
}
