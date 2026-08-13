// biome-ignore-all lint/suspicious/noExplicitAny: Playwright evaluates a structured-cloned Render Graph in a separate browser realm.
import type { RenderGraph, RenderGraphNode } from "@aevum/renderer-2d";
import { chromium, type Browser } from "playwright";
import { z } from "zod";
import type { RasterPixels } from "./pixels.js";
import { fidelityFingerprint } from "./stable.js";

export const RASTER_BACKEND_VERSION = "playwright-canvas/1.0.0" as const;

export const RasterRequestSchema = z.strictObject({
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
  devicePixelRatio: z.number().positive().max(4),
  background: z.strictObject({
    r: z.number().int().min(0).max(255),
    g: z.number().int().min(0).max(255),
    b: z.number().int().min(0).max(255),
    a: z.number().min(0).max(1),
  }),
  qualityProfile: z.enum(["DRAFT", "STANDARD", "HIGH_QUALITY", "MAXIMUM_FIDELITY"]),
  time: z.number().nonnegative(),
  reducedMotion: z.boolean(),
  format: z.literal("RGBA8"),
  maxNodes: z.number().int().positive().max(20_000),
  maxPixels: z.number().int().positive().max(16_777_216),
  timeoutMs: z.number().int().positive().max(120_000),
});
export type RasterRequest = z.infer<typeof RasterRequestSchema>;

export interface ResolvedRasterAsset {
  readonly id: string;
  readonly hash: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly family?: string;
}

export interface RasterAssetResolver {
  readonly id: string;
  readonly version: string;
  resolve(assetId: string): ResolvedRasterAsset | undefined | Promise<ResolvedRasterAsset | undefined>;
}

export interface TypographyObservation {
  readonly nodeId: string;
  readonly requestedFamilies: readonly string[];
  readonly loadedFontAssetIds: readonly string[];
  readonly missingFontAssetIds: readonly string[];
  readonly fallbackDetected: boolean;
  readonly lineCount: number;
  readonly lineWidths: readonly number[];
  readonly baselines: readonly number[];
  readonly bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
}

export interface RasterDiagnostic {
  readonly code: "MISSING_FONT" | "FONT_FALLBACK" | "MISSING_IMAGE" | "UNSUPPORTED_OPERATION" | "RESOURCE_LIMIT";
  readonly severity: "WARNING" | "ERROR";
  readonly message: string;
  readonly nodeId?: string;
  readonly assetId?: string;
  readonly supported: boolean;
}

export interface RasterOutput extends RasterPixels {
  readonly backendId: string;
  readonly backendVersion: string;
  readonly rendererVersion: string;
  readonly graphFingerprint: string;
  readonly fingerprint: `sha256:${string}`;
  readonly typography: readonly TypographyObservation[];
  readonly diagnostics: readonly RasterDiagnostic[];
  readonly fontAssetHashes: readonly string[];
  readonly imageAssetHashes: readonly string[];
}

export interface RasterBackend {
  readonly id: string;
  readonly version: string;
  render(graph: RenderGraph, request: RasterRequest): Promise<RasterOutput>;
  close(): Promise<void>;
}

interface BrowserAsset {
  id: string;
  hash: string;
  mimeType: string;
  dataUrl: string;
  family?: string;
}

function dataUrl(asset: ResolvedRasterAsset): string {
  return `data:${asset.mimeType};base64,${Buffer.from(asset.bytes).toString("base64")}`;
}

function operations(graph: RenderGraph): RenderGraphNode[] {
  return [...graph.operations.values()].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
}

async function resolveAssets(graph: RenderGraph, resolver: RasterAssetResolver): Promise<BrowserAsset[]> {
  const ids = new Set<string>();
  for (const operation of graph.operations.values()) {
    if (operation.kind === "IMAGE") ids.add(operation.asset.id);
    if (operation.kind === "TEXT") for (const id of operation.fontAssetIds) ids.add(id);
    if (operation.kind === "VECTOR" && operation.source.type === "SVG_ASSET") ids.add(operation.source.assetId);
  }
  const resolved = await Promise.all([...ids].sort().map((id) => resolver.resolve(id)));
  return resolved
    .filter((asset): asset is ResolvedRasterAsset => Boolean(asset))
    .map((asset) => ({
      id: asset.id,
      hash: asset.hash,
      mimeType: asset.mimeType,
      dataUrl: dataUrl(asset),
      ...(asset.family ? { family: asset.family } : {}),
    }));
}

export function createPlaywrightRasterBackend(input: {
  readonly assetResolver: RasterAssetResolver;
  readonly launch?: () => Promise<Browser>;
}): RasterBackend {
  let browser: Browser | undefined;
  const launch = input.launch ?? (() => chromium.launch({ headless: true }));
  return Object.freeze({
    id: "aevum.playwright-canvas",
    version: RASTER_BACKEND_VERSION,
    async render(graph: RenderGraph, rawRequest: RasterRequest): Promise<RasterOutput> {
      const request = RasterRequestSchema.parse(rawRequest);
      const operationList = operations(graph);
      if (operationList.length > request.maxNodes) throw new Error("FIDELITY_NODE_BUDGET_EXCEEDED");
      if (request.width * request.height * request.devicePixelRatio ** 2 > request.maxPixels)
        throw new Error("FIDELITY_RASTER_PIXEL_BUDGET_EXCEEDED");
      const assets = await resolveAssets(graph, input.assetResolver);
      for (const asset of assets) {
        const isFont = /font|woff|ttf|otf/i.test(asset.mimeType);
        const isImage = asset.mimeType.startsWith("image/");
        if (!isFont && !isImage) throw new Error("FIDELITY_ASSET_MIME_UNSUPPORTED");
        if (isFont && Buffer.byteLength(asset.dataUrl, "utf8") > 48 * 1024 * 1024)
          throw new Error("FIDELITY_FONT_BUDGET_EXCEEDED");
        if (isImage && Buffer.byteLength(asset.dataUrl, "utf8") > 96 * 1024 * 1024)
          throw new Error("FIDELITY_IMAGE_BUDGET_EXCEEDED");
      }
      browser ??= await launch();
      const page = await browser.newPage({
        viewport: { width: request.width, height: request.height },
        deviceScaleFactor: request.devicePixelRatio,
        colorScheme: "light",
        reducedMotion: request.reducedMotion ? "reduce" : "no-preference",
      });
      try {
        await page.setContent('<!doctype html><meta charset="utf-8"><canvas id="aevum"></canvas>');
        const result = await Promise.race([
          page.evaluate(
            async ({ request, operations, assets }) => {
              const canvas = document.querySelector<HTMLCanvasElement>("#aevum");
              if (!canvas) throw new Error("Canvas unavailable.");
              const width = Math.round(request.width * request.devicePixelRatio);
              const height = Math.round(request.height * request.devicePixelRatio);
              canvas.width = width;
              canvas.height = height;
              canvas.style.width = `${request.width}px`;
              canvas.style.height = `${request.height}px`;
              const context = canvas.getContext("2d", { alpha: true, colorSpace: "srgb" });
              if (!context) throw new Error("2D context unavailable.");
              context.scale(request.devicePixelRatio, request.devicePixelRatio);
              context.fillStyle = `rgba(${request.background.r},${request.background.g},${request.background.b},${request.background.a})`;
              context.fillRect(0, 0, request.width, request.height);
              const byAsset = new Map(assets.map((asset) => [asset.id, asset]));
              const diagnostics: Array<Record<string, unknown>> = [];
              const typography: Array<Record<string, unknown>> = [];
              const images = new Map<string, CanvasImageSource>();
              for (const asset of assets.filter((entry) => entry.mimeType.includes("font"))) {
                const family = asset.family ?? `aevum-${asset.id}`;
                try {
                  const font = new FontFace(family, `url(${asset.dataUrl})`);
                  await font.load();
                  document.fonts.add(font);
                } catch {
                  diagnostics.push({
                    code: "MISSING_FONT",
                    severity: "ERROR",
                    message: `Font asset ${asset.id} could not be loaded.`,
                    assetId: asset.id,
                    supported: true,
                  });
                }
              }
              const color = (value: any) => {
                const encode = (channel: number) => Math.round(Math.max(0, Math.min(1, channel)) * 255);
                return `rgba(${encode(value.r)},${encode(value.g)},${encode(value.b)},${Math.max(0, Math.min(1, value.a))})`;
              };
              const paint = (value: any, bounds: any): string | CanvasGradient => {
                if (value.type === "SOLID") return color(value.color);
                const gradient =
                  value.type === "RADIAL_GRADIENT"
                    ? context.createRadialGradient(
                        bounds.x + bounds.width * (value.center?.x ?? 0.5),
                        bounds.y + bounds.height * (value.center?.y ?? 0.5),
                        0,
                        bounds.x + bounds.width * (value.center?.x ?? 0.5),
                        bounds.y + bounds.height * (value.center?.y ?? 0.5),
                        Math.max(bounds.width, bounds.height) * (value.radius ?? 0.5),
                      )
                    : (() => {
                        const angle = value.angle ?? 0;
                        const cx = bounds.x + bounds.width / 2;
                        const cy = bounds.y + bounds.height / 2;
                        const length =
                          Math.abs(bounds.width * Math.cos(angle)) + Math.abs(bounds.height * Math.sin(angle));
                        return context.createLinearGradient(
                          cx - (Math.cos(angle) * length) / 2,
                          cy - (Math.sin(angle) * length) / 2,
                          cx + (Math.cos(angle) * length) / 2,
                          cy + (Math.sin(angle) * length) / 2,
                        );
                      })();
                for (const stop of value.stops) gradient.addColorStop(stop.offset, color(stop.color));
                return gradient;
              };
              const boundsOf = (operation: any) => ({
                x: operation.worldTransform.position.x,
                y: operation.worldTransform.position.y,
                width: operation.dimensions?.width?.value ?? 0,
                height: operation.dimensions?.height?.value ?? 0,
              });
              const effects = new Map<string, readonly any[]>();
              const blends = new Map<string, string>();
              const byOperation = new Map(operations.map((operation: any) => [operation.id, operation]));
              const paints = new Map<string, any>();
              const clips = new Set<string>();
              const masks = new Map<string, readonly string[]>();
              for (const operation of operations) {
                if (operation.kind === "EFFECT") effects.set(operation.runtimeNodeId, operation.effects);
                if (operation.kind === "BLEND")
                  blends.set(operation.runtimeNodeId, operation.blendMode.toLowerCase().replace("_", "-"));
                if (operation.kind === "PAINT") paints.set(operation.runtimeNodeId, operation);
                if (operation.kind === "CLIP") clips.add(operation.runtimeNodeId);
                if (operation.kind === "MASK") masks.set(operation.runtimeNodeId, operation.sourceRuntimeNodeIds);
              }
              const rounded = (bounds: any, radii: any) => {
                context.beginPath();
                context.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, [
                  radii.topLeft,
                  radii.topRight,
                  radii.bottomRight,
                  radii.bottomLeft,
                ]);
              };
              const prepare = (operation: any) => {
                context.globalAlpha = operation.opacity;
                context.globalCompositeOperation = (blends.get(operation.runtimeNodeId) ??
                  "source-over") as GlobalCompositeOperation;
                context.filter = "none";
                context.shadowColor = "transparent";
                context.shadowBlur = 0;
                context.shadowOffsetX = 0;
                context.shadowOffsetY = 0;
                const list = effects.get(operation.runtimeNodeId) ?? [];
                const shadow = list.find((entry: any) => entry.type === "SHADOW" && !entry.inset);
                const blur = list.find((entry: any) => entry.type === "BLUR");
                if (shadow) {
                  context.shadowColor = color(shadow.color);
                  context.shadowBlur = shadow.blur;
                  context.shadowOffsetX = shadow.offsetX;
                  context.shadowOffsetY = shadow.offsetY;
                }
                if (blur) context.filter = `blur(${blur.radius}px)`;
              };
              const applyTransform = (operation: any, bounds: any) => {
                const rotation = operation.worldTransform.rotation?.z ?? 0;
                const scaleX = operation.worldTransform.scale?.x ?? 1;
                const scaleY = operation.worldTransform.scale?.y ?? 1;
                if (rotation !== 0 || scaleX !== 1 || scaleY !== 1) {
                  const centerX = bounds.x + bounds.width / 2;
                  const centerY = bounds.y + bounds.height / 2;
                  context.translate(centerX, centerY);
                  context.rotate(rotation);
                  context.scale(scaleX, scaleY);
                  context.translate(-centerX, -centerY);
                }
              };
              const applyClipBounds = (runtimeNodeId: string) => {
                const source = paints.get(runtimeNodeId);
                if (!source) return;
                const bounds = boundsOf(source);
                rounded(bounds, source.style.cornerRadii);
                context.clip();
              };
              const applyInheritedClips = (operation: any) => {
                let current: any = operation;
                const visited = new Set<string>();
                while (current && !visited.has(current.id)) {
                  visited.add(current.id);
                  if (clips.has(current.runtimeNodeId)) applyClipBounds(current.runtimeNodeId);
                  for (const sourceId of masks.get(current.runtimeNodeId) ?? []) applyClipBounds(sourceId);
                  current = current.parentOperationId ? byOperation.get(current.parentOperationId) : undefined;
                }
              };
              const drawImage = async (operation: any) => {
                const asset = byAsset.get(operation.asset.id);
                if (!asset) {
                  diagnostics.push({
                    code: "MISSING_IMAGE",
                    severity: "ERROR",
                    message: `Image ${operation.asset.id} is unavailable.`,
                    nodeId: operation.canonicalNodeId,
                    assetId: operation.asset.id,
                    supported: true,
                  });
                  return;
                }
                let image = images.get(asset.id);
                if (!image) {
                  const element = new Image();
                  element.src = asset.dataUrl;
                  await element.decode();
                  image = element;
                  images.set(asset.id, image);
                }
                const b = boundsOf(operation);
                const sourceWidth = (image as HTMLImageElement).naturalWidth;
                const sourceHeight = (image as HTMLImageElement).naturalHeight;
                const crop = operation.crop ?? { x: 0, y: 0, width: 1, height: 1 };
                const sx = crop.x * sourceWidth;
                const sy = crop.y * sourceHeight;
                const sw = crop.width * sourceWidth;
                const sh = crop.height * sourceHeight;
                let dx = b.x;
                let dy = b.y;
                let dw = b.width;
                let dh = b.height;
                const sourceAspect = sw / sh;
                const targetAspect = b.width / b.height;
                if (operation.fit === "CONTAIN" || operation.fit === "SCALE_DOWN") {
                  if (sourceAspect > targetAspect) {
                    dh = b.width / sourceAspect;
                    dy += (b.height - dh) / 2;
                  } else {
                    dw = b.height * sourceAspect;
                    dx += (b.width - dw) / 2;
                  }
                }
                if (operation.fit === "COVER") {
                  if (sourceAspect > targetAspect) {
                    const visible = sh * targetAspect;
                    const extra = (sw - visible) / 2;
                    context.drawImage(image, sx + extra, sy, visible, sh, dx, dy, dw, dh);
                    return;
                  }
                  const visible = sw / targetAspect;
                  const extra = (sh - visible) / 2;
                  context.drawImage(image, sx, sy + extra, sw, visible, dx, dy, dw, dh);
                  return;
                }
                context.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
              };
              for (const operation of operations) {
                context.save();
                prepare(operation);
                const b = boundsOf(operation);
                applyInheritedClips(operation);
                applyTransform(operation, b);
                if (
                  operation.kind === "CLIP" ||
                  operation.kind === "MASK" ||
                  operation.kind === "BLEND" ||
                  operation.kind === "EFFECT"
                ) {
                  /* metadata operations are applied to related paint operations */
                } else if (operation.kind === "PAINT" && b.width > 0 && b.height > 0) {
                  rounded(b, operation.style.cornerRadii);
                  for (const fill of operation.style.fills) {
                    context.fillStyle = paint(fill, b);
                    context.fill();
                  }
                  for (const stroke of operation.style.strokes) {
                    context.strokeStyle = paint(stroke.paint, b);
                    context.lineWidth = stroke.width;
                    context.lineJoin = stroke.join.toLowerCase() as CanvasLineJoin;
                    context.lineCap = stroke.cap.toLowerCase() as CanvasLineCap;
                    context.setLineDash(stroke.dashArray);
                    context.stroke();
                  }
                } else if (operation.kind === "IMAGE") await drawImage(operation);
                else if (operation.kind === "VECTOR") {
                  if (operation.source.type === "PATHS")
                    for (const sourcePath of operation.source.paths) {
                      const path = new Path2D(sourcePath.data);
                      for (const fill of operation.fills) {
                        context.fillStyle = paint(fill, b);
                        context.fill(path, operation.source.windingRule === "EVENODD" ? "evenodd" : "nonzero");
                      }
                      for (const stroke of operation.strokes) {
                        context.strokeStyle = paint(stroke.paint, b);
                        context.lineWidth = stroke.width;
                        context.stroke(path);
                      }
                    }
                  else if (operation.source.type === "SHAPE") {
                    rounded(b, { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 });
                    for (const fill of operation.fills) {
                      context.fillStyle = paint(fill, b);
                      context.fill();
                    }
                  } else {
                    const source =
                      operation.source.type === "INLINE_SVG"
                        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(operation.source.source)}`
                        : byAsset.get(operation.source.assetId)?.dataUrl;
                    if (!source)
                      diagnostics.push({
                        code: "UNSUPPORTED_OPERATION",
                        severity: "WARNING",
                        message: `${operation.source.type} source is unavailable.`,
                        nodeId: operation.canonicalNodeId,
                        supported: false,
                      });
                    else {
                      const element = new Image();
                      element.src = source;
                      await element.decode();
                      context.drawImage(element, b.x, b.y, b.width, b.height);
                    }
                  }
                } else if (operation.kind === "TEXT") {
                  const requestedFamilies = [
                    ...new Set(operation.runs.map((run: any) => run.style.fontFamily)),
                  ] as string[];
                  const loadedFontAssetIds = operation.fontAssetIds.filter((id: string) => byAsset.has(id));
                  const missingFontAssetIds = operation.fontAssetIds.filter((id: string) => !byAsset.has(id));
                  context.textBaseline = "alphabetic";
                  context.textAlign =
                    operation.paragraphStyle.alignment.toLowerCase() === "justify"
                      ? "left"
                      : (operation.paragraphStyle.alignment.toLowerCase() as CanvasTextAlign);
                  context.direction = operation.paragraphStyle.direction === "RTL" ? "rtl" : "ltr";
                  const setFont = (style: any) => {
                    const loadedFamily = style.fontAssetId ? byAsset.get(style.fontAssetId)?.family : undefined;
                    const family = loadedFamily ?? style.fontFamily;
                    context.font = `${style.style.toLowerCase()} ${style.weight} ${style.size.value}px "${family}",${style.fallbackFamilies.join(",") || "sans-serif"}`;
                    (context as any).letterSpacing = `${style.letterSpacing.value}px`;
                    context.fontKerning = style.openTypeFeatures.kern === false ? "none" : "normal";
                    context.fontVariantCaps = style.openTypeFeatures.smcp ? "small-caps" : "normal";
                    const axes = Object.entries(style.variableAxes)
                      .map(([tag, value]) => `"${tag}" ${value}`)
                      .join(", ");
                    if ("fontVariationSettings" in context) (context as any).fontVariationSettings = axes || "normal";
                  };
                  type Segment = { text: string; style: any; width: number };
                  const lines: Segment[][] = [[]];
                  let lineWidth = 0;
                  for (const run of operation.runs) {
                    const runText = operation.content.slice(run.start, run.end);
                    for (const token of runText.split(/(\n|\s+)/).filter((value: string) => value.length > 0)) {
                      if (token === "\n") {
                        lines.push([]);
                        lineWidth = 0;
                        continue;
                      }
                      setFont(run.style);
                      const width = context.measureText(token).width;
                      if (lineWidth > 0 && lineWidth + width > b.width && token.trim().length > 0) {
                        lines.push([]);
                        lineWidth = 0;
                      }
                      const segment = {
                        text: lineWidth === 0 ? token.trimStart() : token,
                        style: run.style,
                        width: lineWidth === 0 ? context.measureText(token.trimStart()).width : width,
                      };
                      const currentLine = lines.at(-1);
                      if (!currentLine) throw new Error("Text line state is unavailable.");
                      currentLine.push(segment);
                      lineWidth += segment.width;
                    }
                  }
                  const lineWidths = lines.map((line) => line.reduce((sum, segment) => sum + segment.width, 0));
                  const lineHeights = lines.map((line) =>
                    Math.max(
                      1,
                      ...line.map((segment) => {
                        const configured = segment.style.lineHeight as { multiplier?: number; value?: number };
                        return configured.multiplier
                          ? segment.style.size.value * configured.multiplier
                          : (configured.value ?? segment.style.size.value);
                      }),
                    ),
                  );
                  const totalHeight = lineHeights.reduce((sum, value) => sum + value, 0);
                  let y = b.y + Math.max(1, ...(lines[0] ?? []).map((segment) => segment.style.size.value));
                  if (operation.paragraphStyle.verticalAlignment === "CENTER") y += (b.height - totalHeight) / 2;
                  if (operation.paragraphStyle.verticalAlignment === "BOTTOM") y += b.height - totalHeight;
                  const baselines: number[] = [];
                  const textPaint = paints.get(operation.runtimeNodeId)?.style.fills[0];
                  for (const [lineIndex, line] of lines.entries()) {
                    const width = lineWidths[lineIndex] ?? 0;
                    let x =
                      operation.paragraphStyle.alignment === "CENTER"
                        ? b.x + (b.width - width) / 2
                        : operation.paragraphStyle.alignment === "RIGHT" || operation.paragraphStyle.direction === "RTL"
                          ? b.x + b.width - width
                          : b.x;
                    for (const segment of line) {
                      setFont(segment.style);
                      context.textAlign = "left";
                      context.fillStyle = textPaint ? paint(textPaint, b) : "rgba(0,0,0,1)";
                      context.fillText(segment.text, x, y);
                      x += segment.width;
                    }
                    baselines.push(y);
                    y += lineHeights[lineIndex] ?? 1;
                  }
                  const fallbackDetected =
                    missingFontAssetIds.length > 0 ||
                    operation.runs.some((run: any) => {
                      setFont(run.style);
                      return !document.fonts.check(context.font, operation.content.slice(run.start, run.end));
                    });
                  if (fallbackDetected)
                    diagnostics.push({
                      code: "FONT_FALLBACK",
                      severity: "ERROR",
                      message: `Requested font was not available for ${operation.canonicalNodeId}.`,
                      nodeId: operation.canonicalNodeId,
                      supported: true,
                    });
                  typography.push({
                    nodeId: operation.canonicalNodeId,
                    requestedFamilies,
                    loadedFontAssetIds,
                    missingFontAssetIds,
                    fallbackDetected,
                    lineCount: lines.length,
                    lineWidths,
                    baselines,
                    bounds: b,
                  });
                }
                context.restore();
              }
              const raw = context.getImageData(0, 0, width, height).data;
              let binary = "";
              for (let offset = 0; offset < raw.length; offset += 32_768)
                binary += String.fromCharCode(...raw.subarray(offset, offset + 32_768));
              return { width, height, dataBase64: btoa(binary), typography, diagnostics };
            },
            { request, operations: operationList, assets },
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("FIDELITY_RASTER_TIMEOUT")), request.timeoutMs),
          ),
        ]);
        const typedResult = result as {
          width: number;
          height: number;
          dataBase64: string;
          typography: Array<Record<string, unknown>>;
          diagnostics: Array<Record<string, unknown>>;
        };
        const decoded = Buffer.from(typedResult.dataBase64, "base64");
        const data = new Uint8ClampedArray(decoded.buffer, decoded.byteOffset, decoded.byteLength).slice();
        const content = {
          graphFingerprint: graph.fingerprint,
          request,
          dataHash: fidelityFingerprint(data),
          typography: result.typography,
          diagnostics: result.diagnostics,
        };
        return Object.freeze({
          width: typedResult.width,
          height: typedResult.height,
          data,
          colorSpace: "SRGB" as const,
          backendId: "aevum.playwright-canvas",
          backendVersion: RASTER_BACKEND_VERSION,
          rendererVersion: graph.version,
          graphFingerprint: graph.fingerprint,
          fingerprint: fidelityFingerprint(content),
          typography: typedResult.typography as unknown as readonly TypographyObservation[],
          diagnostics: typedResult.diagnostics as unknown as readonly RasterDiagnostic[],
          fontAssetHashes: assets
            .filter((asset) => asset.mimeType.includes("font"))
            .map((asset) => asset.hash)
            .sort(),
          imageAssetHashes: assets
            .filter((asset) => asset.mimeType.startsWith("image/"))
            .map((asset) => asset.hash)
            .sort(),
        });
      } finally {
        await page.close();
      }
    },
    async close() {
      if (browser) await browser.close();
      browser = undefined;
    },
  });
}
