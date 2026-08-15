/**
 * Real, local OCR via tesseract.js (Apache-2.0, WASM, no API key, no per-request cost, runs fully
 * offline once the English trained-data file is cached locally). No paid vision/OCR API is used
 * anywhere in this package.
 *
 * First run in a given cache directory downloads eng.traineddata once (a real network dependency,
 * not hidden); every run after that against the same cacheDir is fully offline. Callers that need
 * a hard privacy guarantee should pre-populate cacheDir out of band and are responsible for
 * verifying no network access occurs in their environment.
 *
 * A single worker is reused across calls (createOcrSession/close) because recognizing a real
 * poster needs many small, focused recognition passes (see manifest-builder.ts's two-pass
 * localize-then-crop-and-reOCR strategy) and each tesseract.js worker has real startup cost.
 */
import { createWorker, type Bbox, type Block, type Worker } from "tesseract.js";

export interface OcrTextRegion {
  readonly text: string;
  /** Tesseract's own 0-100 confidence for this region. */
  readonly confidence: number;
  readonly bbox: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
}

function toRegion(entry: { text: string; confidence: number; bbox: Bbox }): OcrTextRegion {
  return {
    text: entry.text.trim(),
    confidence: entry.confidence,
    bbox: { x0: entry.bbox.x0, y0: entry.bbox.y0, x1: entry.bbox.x1, y1: entry.bbox.y1 },
  };
}

export interface OcrSession {
  /** Whole-image, line-level pass — finer-grained than paragraphs, good for rough localization. */
  recognizeLines(bytes: Uint8Array): Promise<readonly OcrTextRegion[]>;
  /** A single, focused pass over one (typically cropped) image — used for the real content read. */
  recognize(bytes: Uint8Array): Promise<readonly OcrTextRegion[]>;
  close(): Promise<void>;
}

export async function createOcrSession(
  options: { readonly cacheDir?: string; readonly language?: string } = {},
): Promise<OcrSession> {
  const worker: Worker = await createWorker(options.language ?? "eng", 1, {
    ...(options.cacheDir ? { cachePath: options.cacheDir } : {}),
    logger: () => {},
  });
  return {
    async recognizeLines(bytes) {
      const { data } = await worker.recognize(Buffer.from(bytes), {}, { blocks: true });
      const blocks: readonly Block[] = data.blocks ?? [];
      const lines = blocks.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines));
      return lines.filter((entry) => entry.text.trim().length > 0 && entry.confidence > 0).map(toRegion);
    },
    async recognize(bytes) {
      const { data } = await worker.recognize(Buffer.from(bytes), {}, { blocks: true });
      const blocks: readonly Block[] = data.blocks ?? [];
      const paragraphs = blocks.flatMap((block) => block.paragraphs);
      return paragraphs.filter((entry) => entry.text.trim().length > 0 && entry.confidence > 0).map(toRegion);
    },
    async close() {
      await worker.terminate();
    },
  };
}

/** Convenience one-shot wrapper for simple, whole-image callers (used by tests). */
export async function recognizeText(
  bytes: Uint8Array,
  options: { readonly cacheDir?: string; readonly language?: string } = {},
): Promise<readonly OcrTextRegion[]> {
  const session = await createOcrSession(options);
  try {
    return await session.recognize(bytes);
  } finally {
    await session.close();
  }
}
