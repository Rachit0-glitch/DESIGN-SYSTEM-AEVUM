import { createEntityId } from "./ids.js";
import { createAsset, createDocument, createFrame, createPage, createText, defaultTextStyle } from "./factory.js";
import type { CanonicalDesignDocument, DesignNode } from "./schema.js";

const EMPTY_HASH = `sha256:${"0".repeat(64)}`;
const fixtureOptions = (name: string) => ({ name, now: "2026-08-01T00:00:00.000Z", actorId: "fixture-builder" });

export function createEmptyDocumentFixture(): CanonicalDesignDocument {
  return createDocument(fixtureOptions("Empty document"));
}

export function createLandingPageFixture(): CanonicalDesignDocument {
  const document = createDocument(fixtureOptions("Landing page"));
  const page = createPage("Home");
  const hero = createFrame(page.id, "Hero");
  const heading = createText(hero.id, "Build the impossible.", "Hero heading");
  page.childIds.push(hero.id);
  hero.childIds.push(heading.id);
  document.rootNodeIds.push(page.id);
  document.pages.push(page.id);
  document.nodes = { [page.id]: page, [hero.id]: hero, [heading.id]: heading };
  return document;
}

export function createTypographyDemoFixture(): CanonicalDesignDocument {
  const document = createLandingPageFixture();
  document.metadata.name = "Typography demo";
  const heading = Object.values(document.nodes).find((node) => node.type === "TEXT");
  if (heading?.type !== "TEXT") throw new Error("Typography fixture requires text.");
  const styleId = createEntityId("type");
  document.typography[styleId] = {
    id: styleId,
    name: "Display",
    style: { ...defaultTextStyle(), weight: 700, size: { value: 64, unit: "PX", mode: "FIXED" } },
  };
  const firstRun = heading.runs[0];
  const typography = document.typography[styleId];
  if (!firstRun || !typography) throw new Error("Typography fixture requires a styled text run.");
  heading.runs[0] = { ...firstRun, style: typography.style };
  return document;
}

export function createAssetDemoFixture(): CanonicalDesignDocument {
  const document = createLandingPageFixture();
  document.metadata.name = "Asset demo";
  const asset = createAsset({
    type: "IMAGE",
    name: "Product",
    hash: EMPTY_HASH,
    uri: "fixtures/product.png",
    mimeType: "image/png",
    byteSize: 1024,
  });
  document.assets[asset.id] = asset;
  const frame = Object.values(document.nodes).find((node) => node.type === "FRAME");
  if (!frame) throw new Error("Asset fixture requires a frame.");
  const imageId = createEntityId("image");
  const image: DesignNode = {
    id: imageId,
    type: "IMAGE",
    name: "Product image",
    parentId: frame.id,
    childIds: [],
    visible: true,
    locked: false,
    transform: { ...frame.transform },
    sourceLinks: [],
    metadata: { tags: ["fixture"], customData: {} },
    assetId: asset.id,
    objectFit: "COVER",
  };
  frame.childIds.push(image.id);
  document.nodes[frame.id] = frame;
  document.nodes[image.id] = image;
  return document;
}

export function createComponentDemoFixture(): CanonicalDesignDocument {
  const document = createLandingPageFixture();
  document.metadata.name = "Component demo";
  const root = Object.values(document.nodes).find((node) => node.type === "FRAME");
  if (!root) throw new Error("Component fixture requires a frame.");
  const componentId = createEntityId("component");
  const variantId = createEntityId("variant");
  const slotId = createEntityId("slot");
  document.components[componentId] = {
    id: componentId,
    name: "Hero",
    rootNodeId: root.id,
    variants: [{ id: variantId, name: "Default", properties: { tone: "light" } }],
    slots: [{ id: slotId, name: "Content", accepts: ["TEXT", "IMAGE"] }],
    defaultOverrides: {},
  };
  return document;
}

export const fixtures = {
  empty: createEmptyDocumentFixture,
  landingPage: createLandingPageFixture,
  typographyDemo: createTypographyDemoFixture,
  assetDemo: createAssetDemoFixture,
  componentDemo: createComponentDemoFixture,
} as const;
