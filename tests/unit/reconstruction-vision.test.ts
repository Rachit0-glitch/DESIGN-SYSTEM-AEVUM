import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildManifestFromImage, recognizeText, segmentForeground } from "@aevum/reconstruction-vision";

const SYNTHETIC_WIDTH = 400;
const SYNTHETIC_HEIGHT = 300;
// Gitignored, package-local: first run downloads eng.traineddata once, every run after that
// (including CI cache hits) is fully offline.
const OCR_CACHE_DIR = fileURLToPath(new URL("../../packages/reconstruction-vision/.tesseract-cache/", import.meta.url));

/** A white canvas with one solid red rectangle — a controlled, known-answer test image. */
async function createSyntheticImage(): Promise<Buffer> {
  const svg = `
    <svg width="${SYNTHETIC_WIDTH}" height="${SYNTHETIC_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${SYNTHETIC_WIDTH}" height="${SYNTHETIC_HEIGHT}" fill="#ffffff" />
      <rect x="60" y="80" width="120" height="90" fill="#d0342c" />
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("reconstruction-vision segmentation (pure pixel math, no network)", () => {
  it("finds a distinct solid-color blob for a red rectangle against a white background", async () => {
    const image = await createSyntheticImage();
    const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const result = segmentForeground({
      data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
      width: info.width,
      height: info.height,
    });

    expect(result.paletteColors.length).toBeGreaterThanOrEqual(2);
    // The color palette clusters the whole image; find the reddish blob rather than assuming
    // array order, since the (larger) white background is also a real, reported blob now.
    const reddish = result.blobs.find((blob) => blob.meanColor[0] > 150 && blob.meanColor[1] < 100);
    expect(reddish, JSON.stringify(result.blobs)).toBeDefined();
    // The rectangle is at x:[60,180) y:[80,170) in a 400x300 image — allow a small tolerance for
    // anti-aliasing at the SVG-to-raster edges.
    expect(reddish?.minX).toBeGreaterThanOrEqual(55);
    expect(reddish?.minX).toBeLessThanOrEqual(65);
    expect(reddish?.minY).toBeGreaterThanOrEqual(75);
    expect(reddish?.minY).toBeLessThanOrEqual(85);
    expect(reddish?.maxX).toBeGreaterThanOrEqual(175);
    expect(reddish?.maxX).toBeLessThanOrEqual(185);
  });

  it("reports one blob spanning the whole canvas for a uniform image, not a fabricated empty result", async () => {
    const uniform = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 200, b: 200 } },
    })
      .png()
      .toBuffer();
    const { data, info } = await sharp(uniform).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const result = segmentForeground({
      data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
      width: info.width,
      height: info.height,
    });
    expect(result.blobs.length).toBe(1);
    expect(result.blobs[0]?.pixelCount).toBeGreaterThan(9_000);
  });
});

describe("reconstruction-vision manifest builder (OCR disabled — deterministic, offline)", () => {
  it("builds a schema-valid manifest with a page region and a detected shape region", async () => {
    const image = await createSyntheticImage();
    const { manifest, diagnostics } = await buildManifestFromImage(image, { enableOcr: false });

    expect(manifest.regions[0]).toMatchObject({ key: "page", category: "PAGE" });
    const shapeRegions = manifest.regions.filter(
      (region) => region.category === "SHAPE" || region.category === "IMAGE",
    );
    expect(shapeRegions.length).toBeGreaterThanOrEqual(1);
    expect(shapeRegions[0]?.bounds.width).toBeGreaterThan(50);
    expect(shapeRegions[0]?.bounds.height).toBeGreaterThan(50);
    expect(diagnostics).toContain("OCR disabled by caller; no text regions were produced.");
  });

  it("detects a real rounded-rectangle's corner radius from measured pixels, not just RECTANGLE", async () => {
    const svg = `
      <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="300" fill="#ffffff" />
        <rect x="60" y="80" width="150" height="100" rx="25" fill="#2255aa" />
      </svg>
    `;
    const image = await sharp(Buffer.from(svg)).png().toBuffer();
    const { manifest } = await buildManifestFromImage(image, { enableOcr: false });

    const shape = manifest.regions.find((region) => region.category === "SHAPE");
    expect(shape, JSON.stringify(manifest.regions)).toBeDefined();
    expect(shape?.shape?.shapeType).toBe("RECTANGLE");
    // The real SVG corner radius was 25px; the estimate should land in the same ballpark, not be
    // absent or wildly off (this is a bucketed geometric estimate, not exact reconstruction).
    expect(shape?.shape?.cornerRadius).toBeGreaterThan(10);
    expect(shape?.shape?.cornerRadius).toBeLessThan(45);
  });

  it("detects a real ellipse as ELLIPSE, not RECTANGLE", async () => {
    const svg = `
      <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="300" fill="#ffffff" />
        <ellipse cx="135" cy="130" rx="75" ry="50" fill="#2255aa" />
      </svg>
    `;
    const image = await sharp(Buffer.from(svg)).png().toBuffer();
    const { manifest } = await buildManifestFromImage(image, { enableOcr: false });

    const shape = manifest.regions.find((region) => region.category === "SHAPE");
    expect(shape, JSON.stringify(manifest.regions)).toBeDefined();
    expect(shape?.shape?.shapeType).toBe("ELLIPSE");
  });

  it("detects a real linear gradient's angle and stop colors from measured pixels", async () => {
    const svg = `
      <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#ff0000" />
            <stop offset="100%" stop-color="#0000ff" />
          </linearGradient>
        </defs>
        <rect width="400" height="300" fill="#ffffff" />
        <rect x="60" y="80" width="150" height="100" fill="url(#g)" />
      </svg>
    `;
    const image = await sharp(Buffer.from(svg)).png().toBuffer();
    const { manifest } = await buildManifestFromImage(image, { enableOcr: false });

    const shape = manifest.regions.find((region) => region.category === "SHAPE");
    expect(shape, JSON.stringify(manifest.regions)).toBeDefined();
    expect(shape?.shape?.fill).toBeUndefined();
    const gradient = shape?.shape?.gradient as
      | {
          type: string;
          angle: number;
          stops: [{ r: number; g: number; b: number }, { r: number; g: number; b: number }];
        }
      | undefined;
    expect(gradient, JSON.stringify(shape)).toBeDefined();
    expect(gradient?.type).toBe("LINEAR_GRADIENT");
    // Real sampled endpoints: one side is red (#ff0000), the other blue (#0000ff). Which stop index
    // lands on which color is a genuine, irreducible ambiguity of pixel-only measurement — a
    // rendered red-to-blue gradient is pixel-identical to blue-to-red read in reverse (colors swap
    // together with a 180-degree angle flip), so this checks that a red-ish and a blue-ish stop
    // both exist, not which index each lands on.
    const stops = gradient?.stops ?? [];
    const isReddish = (stop: { r: number; b: number }) => stop.r > 180 && stop.b < 60;
    const isBluish = (stop: { r: number; b: number }) => stop.b > 180 && stop.r < 60;
    expect(stops.some(isReddish), JSON.stringify(stops)).toBe(true);
    expect(stops.some(isBluish), JSON.stringify(stops)).toBe(true);
  });

  it("does not misdetect a flat-colored shape as a gradient", async () => {
    const svg = `
      <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="300" fill="#ffffff" />
        <rect x="60" y="80" width="150" height="100" fill="#2255aa" />
      </svg>
    `;
    const image = await sharp(Buffer.from(svg)).png().toBuffer();
    const { manifest } = await buildManifestFromImage(image, { enableOcr: false });

    const shape = manifest.regions.find((region) => region.category === "SHAPE");
    expect(shape, JSON.stringify(manifest.regions)).toBeDefined();
    expect(shape?.shape?.gradient).toBeUndefined();
    expect(shape?.shape?.fill).toBeDefined();
  });

  it("detects a real stroke color and width around a shape from measured pixels", async () => {
    const svg = `
      <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="300" fill="#ffffff" />
        <rect x="60" y="80" width="150" height="100" fill="#2255aa" stroke="#000000" stroke-width="6" />
      </svg>
    `;
    const image = await sharp(Buffer.from(svg)).png().toBuffer();
    const { manifest } = await buildManifestFromImage(image, { enableOcr: false });

    const shapes = manifest.regions.filter((region) => region.category === "SHAPE");
    // The stroke's own segmentation blob is a real, distinct "frame" region and must not be
    // emitted as its own spurious extra shape — it belongs attached to the fill shape only.
    expect(shapes).toHaveLength(1);
    const stroke = shapes[0]?.shape?.stroke as
      | { color: { r: number; g: number; b: number }; width: number }
      | undefined;
    expect(stroke, JSON.stringify(shapes[0])).toBeDefined();
    expect(stroke?.color.r).toBeLessThan(30);
    expect(stroke?.color.g).toBeLessThan(30);
    expect(stroke?.color.b).toBeLessThan(30);
    expect(stroke?.width).toBe(6);
  });

  it("does not detect a stroke on a plain flat-colored shape", async () => {
    const svg = `
      <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="300" fill="#ffffff" />
        <rect x="60" y="80" width="150" height="100" fill="#2255aa" />
      </svg>
    `;
    const image = await sharp(Buffer.from(svg)).png().toBuffer();
    const { manifest } = await buildManifestFromImage(image, { enableOcr: false });

    const shape = manifest.regions.find((region) => region.category === "SHAPE");
    expect(shape, JSON.stringify(manifest.regions)).toBeDefined();
    expect(shape?.shape?.stroke).toBeUndefined();
  });
});

describe("reconstruction-vision real local OCR (tesseract.js — no paid API)", () => {
  it("recognizes real text content and a correct bounding box from rendered pixels", async () => {
    const svg = `
        <svg width="400" height="150" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="150" fill="#ffffff" />
          <text x="20" y="90" font-family="Arial" font-size="48" fill="#000000">HELLO WORLD</text>
        </svg>
      `;
    const image = await sharp(Buffer.from(svg)).png().toBuffer();
    const regions = await recognizeText(image, { cacheDir: OCR_CACHE_DIR });

    expect(regions.length).toBeGreaterThanOrEqual(1);
    expect(regions[0]?.text.toUpperCase()).toContain("HELLO");
    expect(regions[0]?.confidence).toBeGreaterThan(70);
    expect(regions[0]?.bbox.x0).toBeGreaterThan(0);
    expect(regions[0]?.bbox.x1).toBeLessThan(400);
  }, 60_000);

  it("produces a manifest whose TEXT region contains the real recognized content", async () => {
    const svg = `
        <svg width="400" height="150" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="150" fill="#ffffff" />
          <text x="20" y="90" font-family="Arial" font-size="48" fill="#000000">HELLO WORLD</text>
        </svg>
      `;
    const image = await sharp(Buffer.from(svg)).png().toBuffer();
    const { manifest } = await buildManifestFromImage(image, { ocrCacheDir: OCR_CACHE_DIR });

    const textRegion = manifest.regions.find((region) => region.category === "TEXT");
    expect(textRegion?.text?.content?.toUpperCase()).toContain("HELLO");
  }, 60_000);

  it("estimates a higher font weight for real bold-rendered text than the same text rendered regular", async () => {
    const svgFor = (weight: number) => `
        <svg width="400" height="150" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="150" fill="#ffffff" />
          <text x="20" y="90" font-family="Arial" font-size="48" font-weight="${weight}" fill="#000000">HELLO</text>
        </svg>
      `;
    const regularImage = await sharp(Buffer.from(svgFor(400)))
      .png()
      .toBuffer();
    const boldImage = await sharp(Buffer.from(svgFor(900)))
      .png()
      .toBuffer();

    const regularResult = await buildManifestFromImage(regularImage, { ocrCacheDir: OCR_CACHE_DIR });
    const boldResult = await buildManifestFromImage(boldImage, { ocrCacheDir: OCR_CACHE_DIR });

    const regularWeight = regularResult.manifest.regions.find((region) => region.category === "TEXT")?.text?.fontWeight;
    const boldWeight = boldResult.manifest.regions.find((region) => region.category === "TEXT")?.text?.fontWeight;

    expect(regularWeight, JSON.stringify(regularResult.manifest.regions)).toBeDefined();
    expect(boldWeight, JSON.stringify(boldResult.manifest.regions)).toBeDefined();
    // A real, measured signal, not a fabricated constant: the two must actually differ, and the
    // bold rendering must measure heavier, not merely non-equal in some arbitrary direction.
    expect(boldWeight as number).toBeGreaterThan(regularWeight as number);
  }, 90_000);
});
