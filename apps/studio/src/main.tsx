import {
  AlignCenter,
  AppWindow,
  PackageOpen,
  Bot,
  Box,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Frame,
  Hand,
  Image,
  Lock,
  Maximize,
  Menu,
  Monitor,
  MousePointer2,
  PanelBottom,
  Pause,
  Play,
  Redo2,
  Search,
  Send,
  Shapes,
  Smartphone,
  Sparkles,
  Tablet,
  Type,
  Undo2,
  Unlock,
  VectorSquare,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import React, { Component, memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import type { DesignNode } from "@aevum/document-model";
import type { RenderGraphNode, RenderPaint } from "@aevum/renderer-2d";
import { createStudioProjectFixture, studioFixtureIds } from "./core/fixture.js";
import { createDeterministicStudioAgentGateway } from "./core/agent.js";
import { createStudioSession, type StudioSession, type StudioSessionSnapshot } from "./core/session.js";
import {
  createStudioTransientState,
  snapValue,
  type StudioPanel,
  type StudioTool,
  type StudioWorkspace,
} from "./core/studio-state.js";
import "./styles.css";

const projectFixture = createStudioProjectFixture();
const storage = {
  load(projectId: string): string | null {
    try {
      return localStorage.getItem(`aevum.studio.project.${projectId}`);
    } catch {
      return null;
    }
  },
  save(projectId: string, document: string): void {
    localStorage.setItem(`aevum.studio.project.${projectId}`, document);
  },
};
const session = createStudioSession({ ...projectFixture, persistence: storage });
const agentGateway = createDeterministicStudioAgentGateway({
  session,
  workspaceId: projectFixture.project.workspaceId,
  projectId: projectFixture.project.id,
  documentId: projectFixture.document.metadata.id,
});

function useStudioSnapshot(source: StudioSession): StudioSessionSnapshot {
  return useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
}

class StudioErrorBoundary extends Component<{ children: React.ReactNode }, { failed: boolean; message: string }> {
  override state = { failed: false, message: "" };
  static getDerivedStateFromError(error: unknown) {
    return { failed: true, message: error instanceof Error ? error.message : "Unknown panel failure" };
  }
  override render() {
    if (this.state.failed)
      return (
        <section className="panel-error" role="alert">
          <strong>Workspace unavailable</strong>
          <span>{this.state.message}</span>
          <button type="button" onClick={() => this.setState({ failed: false, message: "" })}>
            Retry
          </button>
        </section>
      );
    return this.props.children;
  }
}

function IconButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`icon-button${active ? " is-active" : ""}`}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const toolItems: readonly [StudioTool, string, React.ReactNode][] = [
  ["SELECT", "Select (V)", <MousePointer2 key="select" />],
  ["FRAME", "Frame (F)", <Frame key="frame" />],
  ["TEXT", "Text (T)", <Type key="text" />],
  ["SHAPE", "Shape (R)", <Shapes key="shape" />],
  ["IMAGE", "Asset (I)", <Image key="image" />],
  ["VECTOR", "Vector (P)", <VectorSquare key="vector" />],
  ["HAND", "Pan (H)", <Hand key="hand" />],
];

function TopBar({
  snapshot,
  workspace,
  onWorkspace,
}: {
  snapshot: StudioSessionSnapshot;
  workspace: StudioWorkspace;
  onWorkspace: (value: StudioWorkspace) => void;
}) {
  return (
    <header className="topbar">
      <div className="brand-mark" title="AEVUM Studio">
        <span>A</span>
      </div>
      <div className="document-identity">
        <strong>{snapshot.document.metadata.name}</strong>
        <span>
          v{snapshot.document.documentVersion} · {snapshot.saveState.toLowerCase()}
        </span>
      </div>
      <nav className="workspace-switcher" aria-label="Workspace">
        {(["DESIGN", "ANIMATION", "THREE_D", "FIDELITY"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={workspace === item ? "active" : ""}
            onClick={() => onWorkspace(item)}
          >
            {item === "THREE_D" ? "3D" : item[0] + item.slice(1).toLowerCase()}
          </button>
        ))}
      </nav>
      <div className="top-actions">
        <IconButton label="Undo" disabled={!snapshot.history.canUndo} onClick={() => session.undo()}>
          <Undo2 />
        </IconButton>
        <IconButton label="Redo" disabled={!snapshot.history.canRedo} onClick={() => session.redo()}>
          <Redo2 />
        </IconButton>
        <button className="preview-button" type="button">
          <Play /> Preview
        </button>
        <button className="share-button" type="button">
          Share
        </button>
      </div>
    </header>
  );
}

function ToolRail({
  active,
  onChange,
  onAi,
}: {
  active: StudioTool;
  onChange: (tool: StudioTool) => void;
  onAi: () => void;
}) {
  return (
    <aside className="toolrail" aria-label="Tools">
      {toolItems.map(([tool, label, icon]) => (
        <IconButton key={tool} label={label} active={active === tool} onClick={() => onChange(tool)}>
          {icon}
        </IconButton>
      ))}
      <span className="tool-spacer" />
      <IconButton label="AEVUM AI" onClick={onAi}>
        <Sparkles />
      </IconButton>
    </aside>
  );
}

function nodeIcon(type: DesignNode["type"]): React.ReactNode {
  if (type === "TEXT") return <Type />;
  if (type === "SHAPE" || type === "VECTOR" || type === "SVG") return <Shapes />;
  if (type === "IMAGE" || type === "VIDEO") return <Image />;
  if (type.includes("3D")) return <Box />;
  if (type === "PAGE") return <AppWindow />;
  return <Frame />;
}

const LayerTree = memo(function LayerTree({
  snapshot,
  selected,
  expanded,
  query,
  onSelect,
  onToggle,
}: {
  snapshot: StudioSessionSnapshot;
  selected: readonly string[];
  expanded: ReadonlySet<string>;
  query: string;
  onSelect: (id: string, additive: boolean) => void;
  onToggle: (id: string) => void;
}) {
  const renderNode = (nodeId: string, depth: number): React.ReactNode => {
    const node = snapshot.document.nodes[nodeId];
    if (!node) return null;
    const matches = query.length === 0 || node.name.toLowerCase().includes(query.toLowerCase());
    const children = expanded.has(node.id) || query ? node.childIds.map((child) => renderNode(child, depth + 1)) : null;
    if (!matches && !children) return null;
    return (
      <React.Fragment key={node.id}>
        <div
          className={`layer-row${selected.includes(node.id) ? " selected" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          <button
            type="button"
            className="layer-disclosure"
            aria-label={`${expanded.has(node.id) ? "Collapse" : "Expand"} ${node.name}`}
            disabled={node.childIds.length === 0}
            onClick={() => onToggle(node.id)}
          >
            {node.childIds.length ? expanded.has(node.id) ? <ChevronDown /> : <ChevronRight /> : null}
          </button>
          <button
            type="button"
            className="layer-select"
            data-node-id={node.id}
            onClick={(event) => onSelect(node.id, event.shiftKey)}
          >
            <span className="layer-type">{nodeIcon(node.type)}</span>
            <span className="layer-name">{node.name}</span>
            {node.locked ? <Lock className="row-state" /> : null}
            {node.visible ? null : <EyeOff className="row-state" />}
          </button>
        </div>
        {children}
      </React.Fragment>
    );
  };
  return <div className="layer-tree">{snapshot.document.rootNodeIds.map((id) => renderNode(id, 0))}</div>;
});

function LeftPanel({
  panel,
  onPanel,
  snapshot,
  selected,
  expanded,
  onSelect,
  onToggle,
}: {
  panel: StudioPanel;
  onPanel: (panel: StudioPanel) => void;
  snapshot: StudioSessionSnapshot;
  selected: readonly string[];
  expanded: ReadonlySet<string>;
  onSelect: (id: string, additive: boolean) => void;
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  return (
    <aside className="left-panel">
      <div className="panel-tabs">
        {(["LAYERS", "ASSETS", "REFERENCES", "AI"] as const).map((item) => (
          <button key={item} type="button" className={panel === item ? "active" : ""} onClick={() => onPanel(item)}>
            {item === "REFERENCES" ? "Refs" : item[0] + item.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      {panel === "LAYERS" ? (
        <>
          <label className="search-field">
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search layers"
              aria-label="Search layers"
            />
          </label>
          <LayerTree
            snapshot={snapshot}
            selected={selected}
            expanded={expanded}
            query={query}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        </>
      ) : null}
      {panel === "ASSETS" ? <AssetPanel snapshot={snapshot} /> : null}
      {panel === "REFERENCES" ? <ReferencesPanel /> : null}
      {panel === "AI" ? <AiPanel snapshot={snapshot} selected={selected} onSelect={onSelect} /> : null}
    </aside>
  );
}

function AssetPanel({ snapshot }: { snapshot: StudioSessionSnapshot }) {
  return (
    <div className="asset-panel">
      <div className="section-heading">
        <span>Project assets</span>
        <button type="button" aria-label="Asset menu">
          <Menu />
        </button>
      </div>
      {Object.values(snapshot.document.assets).map((asset) => (
        <button type="button" className="asset-row" key={asset.id}>
          <span className="asset-preview">{asset.type === "FONT" ? <Type /> : <PackageOpen />}</span>
          <span>
            <strong>{asset.name}</strong>
            <small>
              {asset.type} · {(asset.byteSize / 1024).toFixed(1)} KB
            </small>
          </span>
        </button>
      ))}
      <button type="button" className="secondary-command">
        Register asset
      </button>
    </div>
  );
}

function ReferencesPanel() {
  return (
    <div className="reference-panel">
      <div className="reference-thumb">
        <div className="reference-art">
          <span>94.8</span>
        </div>
      </div>
      <strong>Launch reference</strong>
      <span>1440 × 900 · SRGB</span>
      <button type="button" className="secondary-command">
        Replace reference
      </button>
    </div>
  );
}

type AiStage =
  | "IDLE"
  | "UNDERSTANDING"
  | "INSPECTING"
  | "PLANNING"
  | "DRY_RUN"
  | "APPLYING"
  | "RENDERING"
  | "VERIFYING"
  | "COMPLETE"
  | "FAILED";
const aiLabels: Record<AiStage, string> = {
  IDLE: "Ready",
  UNDERSTANDING: "Understanding request",
  INSPECTING: "Inspecting selection",
  PLANNING: "Planning changes",
  DRY_RUN: "Dry-running",
  APPLYING: "Applying changes",
  RENDERING: "Rendering",
  VERIFYING: "Verifying",
  COMPLETE: "Complete",
  FAILED: "Failed",
};

function AiPanel({
  snapshot,
  selected,
  onSelect,
}: {
  snapshot: StudioSessionSnapshot;
  selected: readonly string[];
  onSelect: (id: string, additive: boolean) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [stage, setStage] = useState<AiStage>("IDLE");
  const [actions, setActions] = useState<string[]>([]);
  const run = async () => {
    const nodeId = selected[0] ?? studioFixtureIds.heading;
    const node = snapshot.document.nodes[nodeId];
    if (!node || node.locked || !prompt.trim()) {
      setStage("FAILED");
      setActions([node?.locked ? "Selected node is locked." : "Select an editable layer and enter an instruction."]);
      return;
    }
    onSelect(nodeId, false);
    for (const next of ["UNDERSTANDING", "INSPECTING", "PLANNING", "DRY_RUN", "APPLYING"] as AiStage[]) {
      setStage(next);
      await new Promise((resolve) => setTimeout(resolve, 90));
    }
    try {
      const oldX = node.transform.position.x;
      const nextX = prompt.toLowerCase().includes("center")
        ? Math.round((1440 - (node.dimensions?.width.value ?? 400)) / 2)
        : oldX + 20;
      const correlationId = `studio_ai_${crypto.randomUUID()}`;
      await agentGateway.updateNode({
        nodeId,
        changes: { transform: { ...node.transform, position: { ...node.transform.position, x: nextX } } },
        expectedDocumentVersion: snapshot.document.documentVersion,
        correlationId,
      });
      setActions([
        `Changed ${node.name}: X ${oldX} → ${nextX}`,
        `Canonical document advanced to v${snapshot.document.documentVersion + 1}`,
      ]);
      setStage("RENDERING");
      await new Promise((resolve) => setTimeout(resolve, 90));
      setStage("VERIFYING");
      await new Promise((resolve) => setTimeout(resolve, 90));
      setStage("COMPLETE");
      setPrompt("");
    } catch (error) {
      setStage("FAILED");
      setActions([error instanceof Error ? error.message : "Agent operation failed."]);
    }
  };
  return (
    <div className="ai-panel">
      <div className="ai-heading">
        <span className="ai-symbol">
          <Bot />
        </span>
        <div>
          <strong>AEVUM AI</strong>
          <span>
            {selected.length
              ? `${selected.length} layer${selected.length > 1 ? "s" : ""} in context`
              : "Document context"}
          </span>
        </div>
      </div>
      <div className={`ai-status status-${stage.toLowerCase()}`}>
        <span className="status-pulse" />
        <strong>{aiLabels[stage]}</strong>
      </div>
      <div className="ai-actions" aria-live="polite">
        {actions.length ? (
          actions.map((action) => (
            <div key={action}>
              <WandSparkles />
              <span>{action}</span>
            </div>
          ))
        ) : (
          <p>Operational actions will appear here.</p>
        )}
      </div>
      <label className="ai-compose">
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe a change…" />
        <button type="button" aria-label="Send instruction" onClick={() => void run()}>
          <Send />
        </button>
      </label>
      <span className="ai-footnote">Dry run · MCP permissions · Command Engine</span>
    </div>
  );
}

function paintCss(paint: RenderPaint | undefined): string | undefined {
  if (!paint) return undefined;
  if (paint.type === "SOLID")
    return `rgba(${Math.round(paint.color.r * 255)}, ${Math.round(paint.color.g * 255)}, ${Math.round(paint.color.b * 255)}, ${paint.color.a})`;
  const stops = paint.stops
    .map((stop) => `${paintCss({ type: "SOLID", color: stop.color })} ${stop.offset * 100}%`)
    .join(", ");
  return paint.type === "LINEAR_GRADIENT"
    ? `linear-gradient(${paint.angle ?? 0}deg, ${stops})`
    : `radial-gradient(circle, ${stops})`;
}

function CanvasNode({
  node,
  operation,
  selected,
  onSelect,
  onCommit,
  scale,
  displayX,
  displayY,
  depth,
}: {
  node: DesignNode;
  operation?: RenderGraphNode | undefined;
  selected: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onCommit: (node: DesignNode, x: number, y: number) => void;
  scale: number;
  displayX: number;
  displayY: number;
  depth: number;
}) {
  const [drag, setDrag] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null);
  if (node.type === "PAGE") return null;
  const width = node.dimensions?.width.value ?? (node.type === "TEXT" ? 600 : 120);
  const height = node.dimensions?.height.value ?? (node.type === "TEXT" ? 80 : 120);
  const x = drag?.x ?? displayX;
  const y = drag?.y ?? displayY;
  const custom = node.metadata.customData;
  const operationPaint =
    operation?.kind === "PAINT"
      ? operation.style.fills[0]
      : operation?.kind === "VECTOR"
        ? operation.fills[0]
        : undefined;
  const fill =
    paintCss(operationPaint) ??
    (typeof custom["aevum.studio.fill"] === "string" ? custom["aevum.studio.fill"] : "transparent");
  const color = typeof custom["aevum.studio.color"] === "string" ? custom["aevum.studio.color"] : "#e9ece8";
  const radius = typeof custom["aevum.studio.radius"] === "number" ? custom["aevum.studio.radius"] : 0;
  const style: React.CSSProperties = {
    left: x,
    top: y,
    width,
    height,
    zIndex: depth * 100 + (operation?.order ?? 0),
    opacity: node.transform.opacity,
    transform: `rotate(${node.transform.rotation.z}deg)`,
    background: fill,
    borderRadius: radius,
    color,
  };
  const pointerDown = (event: React.PointerEvent) => {
    if (node.locked) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(node.id, event.shiftKey);
    setDrag({ startX: event.clientX, startY: event.clientY, x: displayX, y: displayY });
  };
  const pointerMove = (event: React.PointerEvent) => {
    if (!drag) return;
    setDrag({
      ...drag,
      x: snapValue(displayX + (event.clientX - drag.startX) / scale, [0, 40, 72, 124, 720]),
      y: snapValue(displayY + (event.clientY - drag.startY) / scale, [0, 72, 116, 132, 450]),
    });
  };
  const pointerUp = () => {
    if (!drag) return;
    onCommit(node, drag.x - (displayX - node.transform.position.x), drag.y - (displayY - node.transform.position.y));
    setDrag(null);
  };
  return (
    <div
      className={`canvas-node type-${node.type.toLowerCase()}${selected ? " selected" : ""}`}
      style={style}
      data-canvas-node={node.id}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
    >
      {node.type === "TEXT" ? (
        <textarea
          key={`${node.id}:${node.content}`}
          className="text-content"
          aria-label={`Edit ${node.name}`}
          defaultValue={node.content}
          onBlur={(event) => {
            const content = event.currentTarget.value;
            if (content !== node.content)
              session.updateNode(node.id, {
                content,
                runs: node.runs.map((run, index) => (index === 0 ? { ...run, end: content.length } : run)),
              });
          }}
          style={{
            fontFamily: node.runs[0]?.style.fontFamily,
            fontSize: node.runs[0]?.style.size.value,
            fontWeight: node.runs[0]?.style.weight,
            lineHeight:
              typeof node.runs[0]?.style.lineHeight === "object" && "multiplier" in node.runs[0].style.lineHeight
                ? node.runs[0].style.lineHeight.multiplier
                : undefined,
          }}
        />
      ) : null}
      {selected ? (
        <>
          <span className="selection-name">{node.name}</span>
          <i className="handle nw" />
          <i className="handle ne" />
          <i className="handle sw" />
          <i className="handle se" />
        </>
      ) : null}
    </div>
  );
}

function DesignCanvas({
  snapshot,
  selected,
  zoom,
  pan,
  onSelect,
  onCommit,
  onPan,
}: {
  snapshot: StudioSessionSnapshot;
  selected: readonly string[];
  zoom: number;
  pan: { x: number; y: number };
  onSelect: (id: string, additive: boolean) => void;
  onCommit: (node: DesignNode, x: number, y: number) => void;
  onPan: (deltaX: number, deltaY: number) => void;
}) {
  const viewport = snapshot.document.settings.viewports[snapshot.viewportId];
  const operations = useMemo(() => {
    const map = new Map<string, RenderGraphNode>();
    for (const op of snapshot.renderer.graph.operations.values())
      if (!map.has(op.canonicalNodeId) || op.kind === "PAINT") map.set(op.canonicalNodeId, op);
    return map;
  }, [snapshot.renderer.graph]);
  const nodes = [...snapshot.projection.nodes.values()].filter((runtime) => runtime.visible && runtime.type !== "PAGE");
  const panRef = useRef<{ x: number; y: number } | null>(null);
  return (
    <main
      className="canvas-area"
      data-testid="studio-canvas"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onSelect("", false);
        if (event.button === 1 || event.altKey) panRef.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        if (!panRef.current) return;
        onPan(event.clientX - panRef.current.x, event.clientY - panRef.current.y);
        panRef.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={() => {
        panRef.current = null;
      }}
    >
      <div
        className="canvas-stage"
        style={{
          width: viewport?.width ?? 1440,
          height: viewport?.height ?? 900,
          transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
        data-viewport={viewport?.category}
      >
        {nodes.map((runtime) => (
          <CanvasNode
            key={runtime.id}
            node={runtime.resolvedNode}
            operation={operations.get(runtime.sourceNode.id)}
            selected={selected.includes(runtime.sourceNode.id)}
            onSelect={onSelect}
            onCommit={onCommit}
            scale={zoom}
            displayX={runtime.worldTransform.position.x}
            displayY={runtime.worldTransform.position.y}
            depth={runtime.depth}
          />
        ))}
      </div>
    </main>
  );
}

function NumericField({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100));
  useEffect(() => setDraft(String(Math.round(value * 100) / 100)), [value]);
  return (
    <label className="numeric-field">
      <span>{label}</span>
      <input
        inputMode="decimal"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const parsed = Number(draft);
          if (Number.isFinite(parsed) && parsed !== value) onCommit(parsed);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function PropertiesPanel({ snapshot, selected }: { snapshot: StudioSessionSnapshot; selected: readonly string[] }) {
  const node = selected.length === 1 ? snapshot.document.nodes[selected[0] ?? ""] : undefined;
  if (!node)
    return (
      <aside className="properties-panel empty-panel">
        <AlignCenter />
        <strong>{selected.length > 1 ? `${selected.length} layers selected` : "Nothing selected"}</strong>
        <span>Select a layer to inspect precise values.</span>
      </aside>
    );
  const updateTransform = (part: Partial<DesignNode["transform"]>) =>
    session.updateNode(node.id, { transform: { ...node.transform, ...part } });
  const updateDimensions = (part: Record<string, unknown>) =>
    session.updateNode(node.id, { dimensions: { ...node.dimensions, ...part } });
  const aspectRatioLocked =
    node.constraints && !Array.isArray(node.constraints) && "aspectRatioLocked" in node.constraints
      ? (node.constraints.aspectRatioLocked ?? false)
      : false;
  return (
    <aside className="properties-panel" data-testid="properties-panel">
      <div className="properties-heading">
        <div>
          {nodeIcon(node.type)}
          <span>
            <strong>{node.name}</strong>
            <small>{node.type.replaceAll("_", " ")}</small>
          </span>
        </div>
        <div>
          <IconButton
            label={node.visible ? "Hide" : "Show"}
            onClick={() => session.updateNode(node.id, { visible: !node.visible })}
          >
            {node.visible ? <Eye /> : <EyeOff />}
          </IconButton>
          <IconButton
            label={node.locked ? "Unlock" : "Lock"}
            onClick={() => session.updateNode(node.id, { locked: !node.locked })}
          >
            {node.locked ? <Lock /> : <Unlock />}
          </IconButton>
        </div>
      </div>
      <PropertySection title="Position">
        <div className="property-grid">
          <NumericField
            label="X"
            value={node.transform.position.x}
            onCommit={(x) => updateTransform({ position: { ...node.transform.position, x } })}
          />
          <NumericField
            label="Y"
            value={node.transform.position.y}
            onCommit={(y) => updateTransform({ position: { ...node.transform.position, y } })}
          />
          <NumericField
            label="R"
            value={node.transform.rotation.z}
            onCommit={(z) => updateTransform({ rotation: { ...node.transform.rotation, z } })}
          />
          <NumericField
            label="O"
            value={node.transform.opacity * 100}
            onCommit={(opacity) => updateTransform({ opacity: Math.max(0, Math.min(1, opacity / 100)) })}
          />
        </div>
      </PropertySection>
      {node.dimensions ? (
        <PropertySection title="Size">
          <div className="property-grid">
            <NumericField
              label="W"
              value={node.dimensions.width.value}
              onCommit={(value) => updateDimensions({ width: { ...node.dimensions?.width, value } })}
            />
            <NumericField
              label="H"
              value={node.dimensions.height.value}
              onCommit={(value) => updateDimensions({ height: { ...node.dimensions?.height, value } })}
            />
          </div>
          {!Array.isArray(node.constraints) ? (
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={aspectRatioLocked}
                onChange={(event) =>
                  session.updateNode(node.id, {
                    constraints: { ...node.constraints, aspectRatioLocked: event.target.checked },
                  })
                }
              />{" "}
              Lock ratio
            </label>
          ) : null}
        </PropertySection>
      ) : null}
      {node.type === "TEXT" ? <TypographySection node={node} /> : null}
      {node.type === "IMAGE" ? (
        <PropertySection title="Image">
          <label className="select-field">
            <span>Fit</span>
            <select
              value={node.objectFit}
              onChange={(event) => session.updateNode(node.id, { objectFit: event.target.value })}
            >
              <option>COVER</option>
              <option>CONTAIN</option>
              <option>FILL</option>
            </select>
          </label>
        </PropertySection>
      ) : null}
      <PropertySection title="Responsive">
        <div className="responsive-state">
          <span className={node.responsive ? "override-dot active" : "override-dot"} />
          {node.responsive ? "Viewport overrides active" : "Base properties"}
        </div>
        {node.responsive ? (
          <button type="button" className="text-command">
            Inspect overrides
          </button>
        ) : null}
      </PropertySection>
      <PropertySection title="Effects">
        <label className="select-field">
          <span>Blend</span>
          <select defaultValue="NORMAL">
            <option>NORMAL</option>
            <option>MULTIPLY</option>
            <option>SCREEN</option>
          </select>
        </label>
      </PropertySection>
    </aside>
  );
}

function PropertySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="property-section">
      <div className="section-heading">
        <strong>{title}</strong>
        <button type="button" aria-label={`${title} options`}>
          <Menu />
        </button>
      </div>
      {children}
    </section>
  );
}

function TypographySection({ node }: { node: Extract<DesignNode, { type: "TEXT" }> }) {
  const style = node.runs[0]?.style;
  if (!style) return null;
  const updateStyle = (changes: Partial<typeof style>) =>
    session.updateNode(node.id, { runs: node.runs.map((run) => ({ ...run, style: { ...run.style, ...changes } })) });
  return (
    <PropertySection title="Typography">
      <label className="select-field">
        <span>Font</span>
        <select
          value={style.fontFamily}
          onChange={(event) =>
            updateStyle({
              fontFamily: event.target.value,
              fontAssetId: studioFixtureIds.font,
              fontMatchStatus: "EXACT",
            })
          }
        >
          <option value="Basic">Basic</option>
          <option value="Inter">Inter · missing</option>
          <option value="Arial">Arial · system</option>
        </select>
      </label>
      <div className="property-grid">
        <NumericField
          label="Size"
          value={style.size.value}
          onCommit={(value) => updateStyle({ size: { ...style.size, value } })}
        />
        <NumericField
          label="Wt"
          value={style.weight}
          onCommit={(weight) =>
            updateStyle({ weight: Math.round(weight), variableAxes: { ...style.variableAxes, wght: weight } })
          }
        />
        <NumericField
          label="Line"
          value={"multiplier" in style.lineHeight ? style.lineHeight.multiplier : style.lineHeight.value}
          onCommit={(multiplier) => updateStyle({ lineHeight: { multiplier: Math.max(0.1, multiplier) } })}
        />
        <NumericField
          label="Track"
          value={style.letterSpacing.value}
          onCommit={(value) => updateStyle({ letterSpacing: { ...style.letterSpacing, value } })}
        />
      </div>
      <div className="font-status">
        <span /> Basic Regular · exact
      </div>
    </PropertySection>
  );
}

function ViewportControls({
  snapshot,
  zoom,
  onZoom,
  onViewport,
}: {
  snapshot: StudioSessionSnapshot;
  zoom: number;
  onZoom: (value: number) => void;
  onViewport: (id: string) => void;
}) {
  const viewports = Object.values(snapshot.document.settings.viewports);
  return (
    <div className="viewport-controls">
      <div className="device-switcher">
        {viewports.map((viewport) => (
          <IconButton
            key={viewport.id}
            label={viewport.name}
            active={snapshot.viewportId === viewport.id}
            onClick={() => onViewport(viewport.id)}
          >
            {viewport.category === "DESKTOP" ? (
              <Monitor />
            ) : viewport.category === "TABLET" ? (
              <Tablet />
            ) : (
              <Smartphone />
            )}
          </IconButton>
        ))}
      </div>
      <div className="zoom-control">
        <IconButton label="Zoom out" onClick={() => onZoom(Math.max(0.2, zoom - 0.1))}>
          <ZoomOut />
        </IconButton>
        <button type="button" onClick={() => onZoom(0.55)}>
          {Math.round(zoom * 100)}%
        </button>
        <IconButton label="Zoom in" onClick={() => onZoom(Math.min(2, zoom + 0.1))}>
          <ZoomIn />
        </IconButton>
        <IconButton label="Zoom to fit" onClick={() => onZoom(0.55)}>
          <Maximize />
        </IconButton>
      </div>
    </div>
  );
}

function Timeline({
  snapshot,
  open,
  playhead,
  onOpen,
  onPlayhead,
}: {
  snapshot: StudioSessionSnapshot;
  open: boolean;
  playhead: number;
  onOpen: () => void;
  onPlayhead: (value: number) => void;
}) {
  const timeline = Object.values(snapshot.document.timelines)[0];
  return (
    <section className={`timeline${open ? " open" : ""}`}>
      <button type="button" className="timeline-toggle" onClick={onOpen}>
        <PanelBottom />
        <span>Timeline</span>
        <small>{timeline?.name ?? "No animation"}</small>
        <ChevronDown />
      </button>
      {open && timeline ? (
        <div className="timeline-body">
          <div className="timeline-toolbar">
            <IconButton label="Play">
              <Play />
            </IconButton>
            <IconButton label="Pause">
              <Pause />
            </IconButton>
            <strong>{playhead.toFixed(2)}s</strong>
            <label>
              <input
                type="checkbox"
                onChange={(event) => session.setViewport(snapshot.viewportId, playhead, event.target.checked)}
              />{" "}
              Reduced motion
            </label>
          </div>
          <div className="track-row">
            <span>
              <Type /> Hero heading · Opacity
            </span>
            <div className="track-line">
              <input
                aria-label="Animation playhead"
                type="range"
                min="0"
                max={timeline.duration}
                step="0.01"
                value={playhead}
                onChange={(event) => onPlayhead(Number(event.target.value))}
              />
              {timeline.tracks[0]?.keyframes.map((keyframe) => (
                <i
                  key={keyframe.id}
                  style={{ left: `${(keyframe.time / timeline.duration) * 100}%` }}
                  title={`${keyframe.time}s`}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ThreeViewport({
  snapshot,
  selected,
  onSelect,
}: {
  snapshot: StudioSessionSnapshot;
  selected: readonly string[];
  onSelect: (id: string, additive: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canonicalMesh = snapshot.document.nodes[studioFixtureIds.mesh];
    const canonicalMaterial = snapshot.document.materials[studioFixtureIds.material];
    if (canonicalMesh?.type !== "MESH_3D" || canonicalMaterial?.type !== "PBR" || !canonicalMaterial.pbr) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#1b1e20");
    const canonicalCamera = snapshot.document.cameras[studioFixtureIds.camera];
    const camera = new THREE.PerspectiveCamera(
      42,
      1,
      canonicalCamera?.nearClip ?? 0.1,
      canonicalCamera?.farClip ?? 100,
    );
    camera.position.set(
      canonicalCamera?.transform.position.x ?? 4.2,
      canonicalCamera?.transform.position.y ?? 3.2,
      canonicalCamera?.transform.position.z ?? 5.4,
    );
    camera.lookAt(0, 0, 0);
    const pbr = canonicalMaterial.pbr;
    const baseColor = pbr.baseColor;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 2.3, 2.3),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(baseColor.r, baseColor.g, baseColor.b),
        roughness: pbr.roughness,
        metalness: pbr.metalness,
      }),
    );
    mesh.position.set(
      canonicalMesh.transform.position.x,
      canonicalMesh.transform.position.y,
      canonicalMesh.transform.position.z,
    );
    mesh.rotation.set(
      canonicalMesh.transform.rotation.x,
      canonicalMesh.transform.rotation.y,
      canonicalMesh.transform.rotation.z,
    );
    mesh.scale.set(canonicalMesh.transform.scale.x, canonicalMesh.transform.scale.y, canonicalMesh.transform.scale.z);
    scene.add(mesh);
    scene.add(new THREE.HemisphereLight("#e9fff5", "#2d302b", 1.8));
    const canonicalLight = snapshot.document.lights[studioFixtureIds.light];
    const key = new THREE.DirectionalLight("#ff9a78", Math.max(1, (canonicalLight?.intensity ?? 1200) / 300));
    key.position.set(
      canonicalLight?.transform.position.x ?? 3,
      canonicalLight?.transform.position.y ?? 4,
      canonicalLight?.transform.position.z ?? 2,
    );
    scene.add(key);
    scene.add(new THREE.GridHelper(12, 24, "#48504e", "#2b3031"));
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    let frame = 0;
    const animate = () => {
      mesh.rotation.y += 0.0025;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    };
  }, [snapshot.document]);
  const inspected = Object.values(snapshot.document.nodes).find((node) => node.type === "MESH_3D");
  return (
    <main className="three-workspace">
      <canvas ref={canvasRef} data-testid="three-canvas" onClick={() => inspected && onSelect(inspected.id, false)} />
      <div className="three-overlay">
        <span>Perspective</span>
        <span>Maximum Fidelity</span>
      </div>
      <div className="gizmo">
        <i className="axis-x" />
        <i className="axis-y" />
        <i className="axis-z" />
      </div>
      <section className="three-inspector">
        <strong>Scene inspection</strong>
        <div>
          <span>Objects</span>
          <b>{snapshot.projection.statistics.threeDimensionalNodes}</b>
        </div>
        <div>
          <span>Materials</span>
          <b>{Object.keys(snapshot.document.materials).length}</b>
        </div>
        <div>
          <span>Cameras</span>
          <b>{Object.keys(snapshot.document.cameras).length}</b>
        </div>
        <div>
          <span>Lights</span>
          <b>{Object.keys(snapshot.document.lights).length}</b>
        </div>
        <small>{selected.length ? "Canonical selection linked" : "Runtime preview · no scene asset registered"}</small>
      </section>
    </main>
  );
}

function FidelityWorkspace({ onSelect }: { onSelect: (id: string, additive: boolean) => void }) {
  const issues = [
    { domain: "Typography", message: "Heading width +8 px", score: 0.92, nodeId: studioFixtureIds.heading },
    { domain: "Layout", message: "Card X offset +12 px", score: 0.96, nodeId: studioFixtureIds.card },
    { domain: "Effects", message: "Shadow blur unsupported", score: 0.86, nodeId: studioFixtureIds.card },
  ];
  return (
    <main className="fidelity-workspace">
      <header>
        <div>
          <strong>Maximum Fidelity</strong>
          <span>Acceptance reference · 1440 × 900</span>
        </div>
        <div className="comparison-tabs">
          <button type="button">Reference</button>
          <button type="button" className="active">
            Overlay
          </button>
          <button type="button">Heatmap</button>
        </div>
      </header>
      <div className="fidelity-body">
        <section className="comparison-view">
          <div className="comparison-reference">
            <span>REFERENCE</span>
            <div className="mini-layout">
              <b>
                Form follows
                <br />
                intelligence.
              </b>
              <i />
            </div>
          </div>
          <div className="comparison-current">
            <span>CURRENT · 62%</span>
            <div className="mini-layout">
              <b>
                Form follows
                <br />
                intelligence.
              </b>
              <i />
            </div>
          </div>
          <div className="heat-patch one" />
          <div className="heat-patch two" />
        </section>
        <aside className="score-panel">
          <div className="score-ring">
            <strong>94.8</strong>
            <span>Overall</span>
          </div>
          <div className="score-meta">
            <span>
              Coverage <b>98%</b>
            </span>
            <span>
              Confidence <b>96%</b>
            </span>
          </div>
          <div className="domain-bars">
            {issues.map((issue) => (
              <button type="button" key={issue.domain} onClick={() => onSelect(issue.nodeId, false)}>
                <span>
                  <b>{issue.domain}</b>
                  <small>{issue.message}</small>
                </span>
                <strong>{Math.round(issue.score * 100)}</strong>
                <i>
                  <em style={{ width: `${issue.score * 100}%` }} />
                </i>
              </button>
            ))}
          </div>
          <button type="button" className="correction-button">
            <WandSparkles /> Review 2 corrections
          </button>
        </aside>
      </div>
    </main>
  );
}

function App() {
  const snapshot = useStudioSnapshot(session);
  const initial = createStudioTransientState(snapshot.document.rootNodeIds);
  const [tool, setTool] = useState(initial.activeTool);
  const [workspace, setWorkspace] = useState(initial.workspace);
  const [panel, setPanel] = useState(initial.leftPanel);
  const [selected, setSelected] = useState<readonly string[]>(initial.selectedNodeIds);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(Object.keys(snapshot.document.nodes)));
  const [zoom, setZoom] = useState(initial.viewport.zoom);
  const [pan, setPan] = useState({ x: initial.viewport.panX, y: initial.viewport.panY });
  const [timelineOpen, setTimelineOpen] = useState(initial.timelineOpen);
  const [playhead, setPlayhead] = useState(initial.playhead);
  const select = useCallback(
    (nodeId: string, additive: boolean) =>
      setSelected((current) =>
        !nodeId
          ? []
          : additive
            ? current.includes(nodeId)
              ? current.filter((id) => id !== nodeId)
              : [...current, nodeId]
            : [nodeId],
      ),
    [],
  );
  const toggle = useCallback(
    (nodeId: string) =>
      setExpanded((current) => {
        const next = new Set(current);
        next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId);
        return next;
      }),
    [],
  );
  const commitMove = useCallback((node: DesignNode, x: number, y: number) => {
    if (x === node.transform.position.x && y === node.transform.position.y) return;
    session.updateNode(node.id, { transform: { ...node.transform, position: { ...node.transform.position, x, y } } });
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      )
        return;
      const primary = event.ctrlKey || event.metaKey;
      if (primary && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? snapshot.history.canRedo && session.redo() : snapshot.history.canUndo && session.undo();
        return;
      }
      if (primary && event.key.toLowerCase() === "d" && selected[0]) {
        event.preventDefault();
        const next = session.duplicateNode(selected[0]);
        setSelected([next]);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selected[0]) {
        event.preventDefault();
        session.deleteNode(selected[0]);
        setSelected([]);
        return;
      }
      const toolMap: Record<string, StudioTool> = {
        v: "SELECT",
        f: "FRAME",
        t: "TEXT",
        r: "SHAPE",
        i: "IMAGE",
        p: "VECTOR",
        h: "HAND",
      };
      const mapped = toolMap[event.key.toLowerCase()];
      if (mapped) setTool(mapped);
      const delta = event.shiftKey ? 10 : 1;
      if (selected[0] && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        const node = snapshot.document.nodes[selected[0]];
        if (!node || node.locked) return;
        event.preventDefault();
        const dx = event.key === "ArrowLeft" ? -delta : event.key === "ArrowRight" ? delta : 0;
        const dy = event.key === "ArrowUp" ? -delta : event.key === "ArrowDown" ? delta : 0;
        commitMove(node, node.transform.position.x + dx, node.transform.position.y + dy);
      }
      if (event.key === "Escape") setSelected([]);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [commitMove, selected, snapshot.document.nodes, snapshot.history.canRedo, snapshot.history.canUndo]);
  const playheadChange = (value: number) => {
    setPlayhead(value);
    session.setViewport(snapshot.viewportId, value, false);
  };
  return (
    <div className="studio-shell">
      <TopBar
        snapshot={snapshot}
        workspace={workspace}
        onWorkspace={(value) => {
          setWorkspace(value);
          setTimelineOpen(value === "ANIMATION");
        }}
      />
      <ToolRail active={tool} onChange={setTool} onAi={() => setPanel("AI")} />
      <StudioErrorBoundary>
        <LeftPanel
          panel={panel}
          onPanel={setPanel}
          snapshot={snapshot}
          selected={selected}
          expanded={expanded}
          onSelect={select}
          onToggle={toggle}
        />
      </StudioErrorBoundary>
      <section className="workspace-area">
        {workspace === "THREE_D" ? (
          <ThreeViewport snapshot={snapshot} selected={selected} onSelect={select} />
        ) : workspace === "FIDELITY" ? (
          <FidelityWorkspace onSelect={select} />
        ) : (
          <DesignCanvas
            snapshot={snapshot}
            selected={selected}
            zoom={zoom}
            pan={pan}
            onSelect={select}
            onCommit={commitMove}
            onPan={(x, y) => setPan((current) => ({ x: current.x + x, y: current.y + y }))}
          />
        )}
        <ViewportControls
          snapshot={snapshot}
          zoom={zoom}
          onZoom={setZoom}
          onViewport={(id) => session.setViewport(id, playhead, false)}
        />
      </section>
      <StudioErrorBoundary>
        <PropertiesPanel snapshot={snapshot} selected={selected} />
      </StudioErrorBoundary>
      <Timeline
        snapshot={snapshot}
        open={timelineOpen}
        playhead={playhead}
        onOpen={() => setTimelineOpen((value) => !value)}
        onPlayhead={playheadChange}
      />
      {snapshot.lastError ? (
        <div className="error-toast" role="alert">
          <X />
          <span>{snapshot.lastError}</span>
        </div>
      ) : null}
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
