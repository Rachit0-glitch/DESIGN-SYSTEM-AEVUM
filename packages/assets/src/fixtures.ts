import type { AssetRegistrationInput } from "./schemas.js";

const TIME = "2026-08-01T03:00:00.000Z";
const actor = { id: "fixture_asset_worker", type: "WORKER" as const };
const security = { status: "PASSED" as const, inspectedAt: TIME, inspector: "fixture-security", issues: [] };
const provenance = {
  origin: { kind: "UPLOAD" as const, uri: "memory://fixture" },
  importer: actor,
  creator: actor,
  processingChain: [],
  parentAssetIds: [],
};

export const assetFixtures = {
  image: {
    bytes: new TextEncoder().encode("aevum-image-fixture"),
    kind: "IMAGE",
    originalFilename: "fixture.png",
    mimeType: "image/png",
    sourceUri: "memory://fixture.png",
    createdAt: TIME,
    registeredAt: TIME,
    provenance,
    dimensions: { width: 1920, height: 1080 },
    details: { kind: "IMAGE", alpha: true, colorProfile: "sRGB", exif: { orientation: 1 } },
    security,
  },
  video: {
    bytes: new TextEncoder().encode("aevum-video-fixture"),
    kind: "VIDEO",
    originalFilename: "fixture.mp4",
    mimeType: "video/mp4",
    sourceUri: "memory://fixture.mp4",
    createdAt: TIME,
    registeredAt: TIME,
    provenance,
    dimensions: { width: 1920, height: 1080, duration: 12.5 },
    details: { kind: "VIDEO", fps: 24, codec: "h264", audioTracks: 1, alpha: false },
    security,
  },
  model: {
    bytes: new TextEncoder().encode("aevum-model-fixture"),
    kind: "GLB",
    originalFilename: "fixture.glb",
    mimeType: "model/gltf-binary",
    sourceUri: "memory://fixture.glb",
    createdAt: TIME,
    registeredAt: TIME,
    provenance,
    details: { kind: "GLB", meshes: 4, materials: 3, textures: 6, animations: 2 },
    security,
  },
} satisfies Record<string, AssetRegistrationInput>;
