import {
  createEntityId,
  createTransform,
  fixtures,
  type CanonicalDesignDocument,
  type DesignNode,
} from "@aevum/document-model";
import {
  createRuntimeViewport,
  projectScene,
  sceneRuntimeFixtures,
  serializeSceneProjection,
} from "@aevum/scene-runtime";
import {
  buildRenderGraph,
  createRenderer,
  render,
  resolveEffects,
  resolvePaintOrder,
  type ImageOperation,
  type RenderGraphNode,
  type TextOperation,
  type VectorOperation,
} from "@aevum/renderer-2d";
import { describe, expect, it } from "vitest";

const px = (value: number) => ({ value, unit: "PX" as const, mode: "FIXED" as const });
const color = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a, colorSpace: "SRGB" as const });

function requireNode(node: DesignNode | undefined): DesignNode {
  if (!node) throw new Error("Fixture node is missing.");
  return node;
}

function baseNode(parentId: string | null, name: string) {
  return {
    id: createEntityId("node"),
    name,
    parentId,
    childIds: [] as string[],
    visible: true,
    locked: false,
    transform: createTransform(),
    dimensions: { width: px(240), height: px(120) },
    sourceLinks: [],
    metadata: { tags: [], customData: {} as Record<string, unknown> },
  };
}

function append(document: CanonicalDesignDocument, parent: DesignNode, node: DesignNode): void {
  parent.childIds.push(node.id);
  document.nodes[node.id] = node;
}

function createVisualFixture(): CanonicalDesignDocument {
  const document = fixtures.assetDemo();
  const frame = requireNode(Object.values(document.nodes).find((node) => node.type === "FRAME"));
  const fillTokenId = createEntityId("token");
  document.tokens[fillTokenId] = {
    id: fillTokenId,
    name: "Signal red",
    type: "COLOR",
    value: color(0.9, 0.1, 0.2),
  };

  const mask: DesignNode = {
    ...baseNode(frame.id, "Mask"),
    type: "SHAPE",
    shapeType: "ELLIPSE",
    geometry: { radius: 60 },
    fillTokenId,
  };
  mask.metadata.customData["aevum.renderer2d"] = { zIndex: 10 };
  append(document, frame, mask);

  const shape: DesignNode = {
    ...baseNode(frame.id, "Gradient panel"),
    type: "SHAPE",
    shapeType: "RECTANGLE",
    geometry: { width: 240, height: 120 },
    fillTokenId,
  };
  shape.transform.clipping = true;
  shape.transform.maskIds = [mask.id];
  shape.metadata.customData["aevum.renderer2d"] = {
    zIndex: -1,
    blendMode: "MULTIPLY",
    maskType: "ALPHA",
    cornerRadii: { topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 },
    fills: [
      {
        type: "LINEAR_GRADIENT",
        angle: 45,
        stops: [
          { offset: 0, color: color(1, 0, 0) },
          { offset: 1, color: color(0, 0, 1) },
        ],
      },
    ],
    strokes: [
      {
        paint: { type: "SOLID", color: color(1, 1, 1) },
        width: 2,
        alignment: "INSIDE",
        join: "ROUND",
        cap: "ROUND",
        dashArray: [4, 2],
      },
    ],
    effects: [
      { type: "SHADOW", color: color(0, 0, 0, 0.4), offsetX: 0, offsetY: 8, blur: 16, spread: 1 },
      { type: "BLUR", radius: 0.5 },
    ],
    booleanOperation: "UNION",
  };
  append(document, frame, shape);

  const vector: DesignNode = {
    ...baseNode(frame.id, "Logo path"),
    type: "VECTOR",
    paths: [{ data: "M0 0 L10 0 L10 10 Z", closed: true }],
    fillRule: "EVENODD",
  };
  append(document, frame, vector);

  const svg: DesignNode = {
    ...baseNode(frame.id, "Inline mark"),
    type: "SVG",
    inlineSource: '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>',
    sanitized: true,
    optimized: true,
  };
  append(document, frame, svg);

  const image = requireNode(Object.values(document.nodes).find((node) => node.type === "IMAGE"));
  if (image.type !== "IMAGE") throw new Error("Image fixture is missing.");
  image.crop = { x: 0.1, y: 0.2, width: 0.7, height: 0.6 };
  image.metadata.customData["aevum.renderer2d"] = { imageRepeat: "REPEAT_X", imageAlignment: "BOTTOM_RIGHT" };

  const text = requireNode(Object.values(document.nodes).find((node) => node.type === "TEXT"));
  if (text.type !== "TEXT" || !text.runs[0]) throw new Error("Text fixture is missing.");
  text.runs[0].style.variableAxes = { wght: 720, wdth: 95 };
  text.runs[0].style.openTypeFeatures = { liga: true, tnum: 1 };
  text.runs[0].style.fillTokenId = fillTokenId;
  return document;
}

function project(document: CanonicalDesignDocument) {
  return projectScene(document, createRuntimeViewport(document), { strictMode: false });
}

function operationsOf<T extends RenderGraphNode["kind"]>(graph: ReturnType<typeof buildRenderGraph>, kind: T) {
  return [...graph.operations.values()].filter(
    (operation): operation is Extract<RenderGraphNode, { kind: T }> => operation.kind === kind,
  );
}

describe("Hybrid 2D Renderer", () => {
  it("builds an identical deterministic Render Graph for an identical projection", () => {
    const projection = project(createVisualFixture());
    const first = buildRenderGraph(projection);
    const second = buildRenderGraph(projection);

    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.paintOrder).toEqual(first.paintOrder);
    expect([...second.operations.values()]).toEqual([...first.operations.values()]);
    expect(second.edges).toEqual(first.edges);
  });

  it("resolves hierarchy, explicit z-order, masks, and component projections deterministically", () => {
    const visualProjection = project(createVisualFixture());
    const order = resolvePaintOrder(visualProjection);
    const mask = order.nodes.find((node) => node.name === "Mask");
    const target = order.nodes.find((node) => node.name === "Gradient panel");
    expect(mask).toBeDefined();
    expect(target).toBeDefined();
    expect(order.nodeIds.indexOf(mask?.id ?? "")).toBeLessThan(order.nodeIds.indexOf(target?.id ?? ""));

    const componentProjection = project(sceneRuntimeFixtures.component());
    const componentGraph = buildRenderGraph(componentProjection);
    const projectedComponentNode = [...componentProjection.nodes.values()].find((node) => node.componentOrigin);
    expect(projectedComponentNode).toBeDefined();
    expect(
      [...componentGraph.operations.values()].some(
        (operation) => operation.runtimeNodeId === projectedComponentNode?.id,
      ),
    ).toBe(true);
  });

  it("does not mutate the Scene Runtime projection and freezes renderer output", () => {
    const projection = project(createVisualFixture());
    const before = serializeSceneProjection(projection);
    const output = render(projection);

    expect(serializeSceneProjection(projection)).toBe(before);
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output.graph)).toBe(true);
    expect(Object.isFrozen([...output.graph.operations.values()][0])).toBe(true);
  });

  it("represents clipping and alpha-mask relationships without target rendering APIs", () => {
    const graph = buildRenderGraph(project(createVisualFixture()));
    const clips = operationsOf(graph, "CLIP");
    const masks = operationsOf(graph, "MASK");

    expect(clips).toHaveLength(1);
    expect(masks).toHaveLength(1);
    expect(masks[0]?.maskType).toBe("ALPHA");
    expect(graph.edges.map((edge) => edge.type)).toEqual(expect.arrayContaining(["CLIPS", "MASKS"]));
  });

  it("resolves gradients, strokes, blend modes, vector paths, and effects", () => {
    const projection = project(createVisualFixture());
    const graph = buildRenderGraph(projection);
    const panel = [...graph.operations.values()].find(
      (operation) =>
        operation.kind === "PAINT" &&
        operation.canonicalNodeId === projection.nodes.get(operation.runtimeNodeId)?.sourceNode.id &&
        projection.nodes.get(operation.runtimeNodeId)?.name === "Gradient panel",
    );
    const vectors = operationsOf(graph, "VECTOR") as VectorOperation[];
    const panelNode = [...projection.nodes.values()].find((node) => node.name === "Gradient panel");

    expect(panel?.kind === "PAINT" ? panel.style.fills[0]?.type : undefined).toBe("LINEAR_GRADIENT");
    expect(panel?.kind === "PAINT" ? panel.style.strokes[0]?.dashArray : undefined).toEqual([4, 2]);
    expect(operationsOf(graph, "BLEND")[0]?.blendMode).toBe("MULTIPLY");
    expect(
      vectors.some((operation) => operation.source.type === "PATHS" && operation.source.windingRule === "EVENODD"),
    ).toBe(true);
    expect(vectors.some((operation) => operation.source.type === "INLINE_SVG")).toBe(true);
    expect(panelNode ? resolveEffects(panelNode).effects.map((effect) => effect.type) : []).toEqual(["SHADOW", "BLUR"]);
  });

  it("preserves typography runs, variable axes, OpenType features, direction, and alignment metadata", () => {
    const graph = buildRenderGraph(project(createVisualFixture()));
    const text = operationsOf(graph, "TEXT")[0] as TextOperation | undefined;

    expect(text?.runs[0]?.style.variableAxes).toEqual({ wght: 720, wdth: 95 });
    expect(text?.runs[0]?.style.openTypeFeatures).toEqual({ liga: true, tnum: 1 });
    expect(text?.paragraphStyle).toMatchObject({ direction: "AUTO", alignment: "LEFT" });
  });

  it("resolves immutable canonical image metadata without loading the source", () => {
    const graph = buildRenderGraph(project(createVisualFixture()));
    const image = operationsOf(graph, "IMAGE")[0] as ImageOperation | undefined;

    expect(image).toMatchObject({
      fit: "COVER",
      repeat: "REPEAT_X",
      alignment: "BOTTOM_RIGHT",
      crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
      asset: { mimeType: "image/png" },
    });
  });

  it("uses projection, renderer, viewport, and quality data in a bounded renderer cache", () => {
    const projection = project(createVisualFixture());
    const renderer = createRenderer({ cacheSize: 1 });
    const first = renderer.render(projection);
    const second = renderer.render(projection);

    expect(second).toBe(first);
    expect(renderer.cacheStatistics()).toMatchObject({ hits: 1, misses: 1, entries: 1, evictions: 0 });

    const differentDocument = createVisualFixture();
    differentDocument.settings.qualityMode = "DRAFT";
    renderer.render(project(differentDocument));
    expect(renderer.cacheStatistics()).toMatchObject({ misses: 2, entries: 1, evictions: 1 });
  });

  it("reports unsupported nodes and missing assets without inventing output", () => {
    const mixed = sceneRuntimeFixtures.mixed();
    const missingImage: DesignNode = {
      ...baseNode(mixed.rootNodeIds[0] ?? null, "Missing image"),
      type: "IMAGE",
      assetId: createEntityId("asset"),
      objectFit: "CONTAIN",
    };
    const parent = requireNode(mixed.nodes[mixed.rootNodeIds[0] ?? ""]);
    append(mixed, parent, missingImage);
    const output = render(project(mixed));

    expect(output.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["UNSUPPORTED_NODE", "MISSING_ASSET"]),
    );
    expect(output.complete).toBe(false);
    expect(operationsOf(output.graph, "IMAGE").some((operation) => operation.runtimeNodeId === missingImage.id)).toBe(
      false,
    );
  });

  it("reports invalid style metadata and clipping conflicts as recoverable diagnostics", () => {
    const document = fixtures.landingPage();
    const frame = requireNode(Object.values(document.nodes).find((node) => node.type === "FRAME"));
    delete frame.dimensions;
    frame.transform.clipping = true;
    frame.metadata.customData["aevum.renderer2d"] = { blendMode: "not-a-mode" };
    const graph = buildRenderGraph(project(document));

    expect(graph.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["UNRESOLVED_STYLE", "CLIPPING_CONFLICT"]),
    );
  });

  it("exposes resolved canonical fill tokens through Scene Runtime", () => {
    const document = createVisualFixture();
    const projection = project(document);
    const shape = [...projection.nodes.values()].find((node) => node.name === "Gradient panel");

    expect(shape?.resolvedReferences.tokens).toHaveLength(1);
    expect(shape?.resolvedReferences.tokens[0]).toMatchObject({ resolved: true, value: { type: "COLOR" } });
    expect(projection.dependencyGraph.edges.some((edge) => edge.type === "USES_TOKEN")).toBe(true);
  });

  it("resolves a TEXT node's runs[0].style.fillTokenId into a real paint on its PAINT operation", () => {
    const document = createVisualFixture();
    const projection = project(document);
    const graph = buildRenderGraph(projection);
    const textRuntimeNode = [...projection.nodes.values()].find((node) => node.type === "TEXT");
    if (!textRuntimeNode) throw new Error("Text runtime node is missing.");
    const paintOperations = operationsOf(graph, "PAINT");
    const textPaint = paintOperations.find((operation) => operation.runtimeNodeId === textRuntimeNode.id);

    expect(textPaint).toBeDefined();
    expect(textPaint?.style.fills).toHaveLength(1);
    expect(textPaint?.style.fills[0]).toMatchObject({ type: "SOLID", color: { r: 0.9, g: 0.1, b: 0.2 } });
  });

  it("resolves a SHAPE node's fillTokenId into a real gradient paint and strokeTokenId into a real stroke color (CDD 1.9.0)", () => {
    const document = fixtures.assetDemo();
    const frame = requireNode(Object.values(document.nodes).find((node) => node.type === "FRAME"));
    const gradientTokenId = createEntityId("token");
    document.tokens[gradientTokenId] = {
      id: gradientTokenId,
      name: "Sunset gradient",
      type: "GRADIENT",
      value: {
        type: "LINEAR_GRADIENT",
        angle: 90,
        stops: [
          { offset: 0, color: color(1, 0, 0) },
          { offset: 1, color: color(0, 0, 1) },
        ],
      },
    };
    const strokeTokenId = createEntityId("token");
    document.tokens[strokeTokenId] = {
      id: strokeTokenId,
      name: "Stroke black",
      type: "COLOR",
      value: color(0, 0, 0),
    };
    const shape: DesignNode = {
      ...baseNode(frame.id, "Gradient stroked shape"),
      type: "SHAPE",
      shapeType: "RECTANGLE",
      geometry: { width: 150, height: 100 },
      fillTokenId: gradientTokenId,
      strokeTokenId,
    };
    append(document, frame, shape);

    const projection = project(document);
    const graph = buildRenderGraph(projection);
    const shapeRuntimeNode = [...projection.nodes.values()].find((node) => node.name === "Gradient stroked shape");
    if (!shapeRuntimeNode) throw new Error("Shape runtime node is missing.");
    const paintOperations = operationsOf(graph, "PAINT");
    const shapePaint = paintOperations.find((operation) => operation.runtimeNodeId === shapeRuntimeNode.id);

    expect(shapePaint, "no unresolved-style diagnostic should suppress the paint").toBeDefined();
    expect(shapePaint?.style.fills).toHaveLength(1);
    expect(shapePaint?.style.fills[0]).toMatchObject({
      type: "LINEAR_GRADIENT",
      angle: 90,
      stops: [
        { offset: 0, color: { r: 1, g: 0, b: 0 } },
        { offset: 1, color: { r: 0, g: 0, b: 1 } },
      ],
    });
    expect(shapePaint?.style.strokes).toHaveLength(1);
    expect(shapePaint?.style.strokes[0]?.paint).toMatchObject({ type: "SOLID", color: { r: 0, g: 0, b: 0 } });
    expect(
      graph.diagnostics.some(
        (diagnostic) => diagnostic.code === "UNRESOLVED_STYLE" && diagnostic.runtimeNodeId === shapeRuntimeNode.id,
      ),
    ).toBe(false);
  });

  it("renders nested groups in stable parent-before-child order", () => {
    const document = fixtures.landingPage();
    const page = requireNode(document.nodes[document.rootNodeIds[0] ?? ""]);
    const outer: DesignNode = {
      ...baseNode(page.id, "Outer"),
      type: "GROUP",
      isolation: false,
      passThroughBlend: true,
    };
    const inner: DesignNode = {
      ...baseNode(outer.id, "Inner"),
      type: "GROUP",
      isolation: true,
      passThroughBlend: false,
    };
    append(document, page, outer);
    append(document, outer, inner);
    const order = resolvePaintOrder(project(document)).nodeIds;

    expect(order.indexOf(page.id)).toBeLessThan(order.indexOf(outer.id));
    expect(order.indexOf(outer.id)).toBeLessThan(order.indexOf(inner.id));
  });
});
