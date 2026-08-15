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
});
