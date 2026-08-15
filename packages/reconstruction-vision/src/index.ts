import type { PackageContract } from "@aevum/shared";

export * from "./manifest-builder.js";
export * from "./segmentation.js";
export * from "./ocr.js";

export const packageContract: PackageContract = {
  name: "@aevum/reconstruction-vision",
  kind: "package",
  responsibility:
    "Real, local-only computer-vision analysis of reference images: pixel-based region segmentation and OCR text recognition, producing a genuine ReconstructionManifest instead of a hand-authored fixture.",
  owns: "Image decoding, background/foreground segmentation, connected-component region detection, and local OCR.",
  mustNotOwn:
    "Canonical state mutation, MCP transport, paid external vision/OCR APIs, or reconstruction proposal/command generation.",
  status: "IMPLEMENTED",
};

export const RECONSTRUCTION_VISION_STATUS = packageContract.status;
