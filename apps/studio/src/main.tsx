import { createAgentGoal, createAgentSession } from "@aevum/agent-core";
import { createDeterministicReasoningProvider } from "@aevum/agent-planner";
import { createAgentEngine, createInMemoryAgentPersistence } from "@aevum/agent-runtime";
import { CanonicalDesignDocumentSchema, type DesignNode } from "@aevum/document-model";
import type { RenderGraphNode, RenderPaint } from "@aevum/renderer-2d";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  AlignCenter,
  AppWindow,
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
  PackageOpen,
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
import React, {
  Component,
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createDeterministicStudioAgentContext, type StudioAgentContext } from "./core/agent.js";
import { createInteractiveApprovalAdapter, type StudioPendingApproval } from "./core/approval.js";
import { createStudioProjectFixture, studioFixtureIds } from "./core/fixture.js";
import {
  createStudioAuthClient,
  loadProductionStudioProject,
  readStudioBrowserConfiguration,
  type StudioBrowserConfiguration,
} from "./core/production.js";
import { createStudioSession, type StudioSession, type StudioSessionSnapshot } from "./core/session.js";
import {
  createStudioTransientState,
  type StudioPanel,
  type StudioTool,
  type StudioWorkspace,
  snapValue,
} from "./core/studio-state.js";
import "./styles.css";

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
let session: StudioSession;
let agentContext: StudioAgentContext;

// Test-only. session/agentContext are module-scope bindings set once during real bootstrap
// (ProductionBootstrap / the dev fixture path); component tests need a way to seed them before
// rendering a component that closes over them, without restructuring the app's real bootstrap
// flow. Never call these outside a test.
export function __setStudioSessionForTesting(value: StudioSession): void {
  session = value;
}
export function __setStudioAgentContextForTesting(value: StudioAgentContext): void {
  agentContext = value;
}
const ThreeViewport = lazy(() => import("./workspaces/ThreeViewport.js"));

function useStudioSnapshot(source: StudioSession): StudioSessionSnapshot {
  return useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
}

export class StudioErrorBoundary extends Component<
  { children: React.ReactNode },
  { failed: boolean; message: string }
> {
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
      {panel === "REFERENCES" ? <ReferencesPanel snapshot={snapshot} /> : null}
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

function averageScore(scores: Record<string, number>): number | undefined {
  const values = Object.values(scores);
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function encodeBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
}

type ReferenceImportStage = "IDLE" | "UPLOADING" | "ANALYZING" | "IMPORTING" | "DONE" | "FAILED";

export function ReferencesPanel({ snapshot }: { snapshot: StudioSessionSnapshot }) {
  const [importStage, setImportStage] = useState<ReferenceImportStage>("IDLE");
  const [importMessage, setImportMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [replaceStage, setReplaceStage] = useState<"IDLE" | "REPLACING" | "FAILED">("IDLE");
  const [replaceError, setReplaceError] = useState("");
  const [replacingReferenceId, setReplacingReferenceId] = useState<string | undefined>(undefined);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  const importReference = async (file: File) => {
    setImportStage("UPLOADING");
    setImportMessage("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const dimensions = await readImageDimensions(file);
      const correlationId = `studio_import_${crypto.randomUUID()}`;
      const client = agentContext.createMcpClient(correlationId);

      const registered = await client.invoke(
        "asset.register",
        {
          expectedDocumentVersion: snapshot.document.documentVersion,
          kind: "IMAGE",
          bytesBase64: encodeBase64(bytes),
          originalFilename: file.name,
          mimeType: file.type || "image/png",
          width: dimensions.width,
          height: dimensions.height,
          analyzeForReconstruction: true,
        },
        { idempotencyKey: `${correlationId}-register` },
      );
      if (!registered.success || registered.data === undefined) {
        throw new Error(registered.errors[0]?.message ?? "Reference upload failed.");
      }
      const registeredData = registered.data as { assetId: string; resultVersion: number };
      setImportStage("ANALYZING");

      const imported = await client.invoke(
        "reconstruction.import_reference",
        { expectedDocumentVersion: registeredData.resultVersion, sourceAssetId: registeredData.assetId },
        { idempotencyKey: `${correlationId}-import` },
      );
      if (!imported.success || imported.data === undefined) {
        throw new Error(imported.errors[0]?.message ?? "Reference import failed.");
      }
      setImportStage("IMPORTING");

      const read = await client.invoke("document.get", { projection: "full" });
      if (!read.success || read.data === undefined) {
        throw new Error(read.errors[0]?.message ?? "Could not reload the document after import.");
      }
      session.resyncDocument(CanonicalDesignDocumentSchema.parse(read.data));

      const importedData = imported.data as { createdNodeCount: number; textNodeCount: number };
      setImportMessage(
        `Imported ${importedData.createdNodeCount} layer${importedData.createdNodeCount === 1 ? "" : "s"}, ${importedData.textNodeCount} with recognized text.`,
      );
      setImportStage("DONE");
    } catch (error) {
      setImportStage("FAILED");
      setImportMessage(error instanceof Error ? error.message : "Reference import failed.");
    }
  };

  const replaceReference = async (referenceId: string, file: File) => {
    const existing = snapshot.document.references[referenceId];
    if (!existing) return;
    setReplaceStage("REPLACING");
    setReplaceError("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const dimensions = await readImageDimensions(file);
      const correlationId = `studio_replace_${crypto.randomUUID()}`;
      const client = agentContext.createMcpClient(correlationId);

      const registered = await client.invoke(
        "asset.register",
        {
          expectedDocumentVersion: snapshot.document.documentVersion,
          kind: "IMAGE",
          bytesBase64: encodeBase64(bytes),
          originalFilename: file.name,
          mimeType: file.type || "image/png",
          width: dimensions.width,
          height: dimensions.height,
        },
        { idempotencyKey: `${correlationId}-register` },
      );
      if (!registered.success || registered.data === undefined) {
        throw new Error(registered.errors[0]?.message ?? "Replacement upload failed.");
      }
      const registeredData = registered.data as { assetId: string; resultVersion: number };

      // asset.register was invoked directly above (its payload shape doesn't match the command
      // gateway, same as the import flow), so the session's local document doesn't know about the
      // new asset yet. Resync from the server before routing reference.update through the real
      // command gateway (session.updateReference), since its local optimistic apply requires the
      // referenced asset to already exist in the local store.
      const read = await client.invoke("document.get", { projection: "full" });
      if (!read.success || read.data === undefined) {
        throw new Error(read.errors[0]?.message ?? "Could not reload the document after upload.");
      }
      session.resyncDocument(CanonicalDesignDocumentSchema.parse(read.data));

      // Real "replace": the reference keeps its own id (and stays linked to any ValidationRecords
      // that already cite it by referenceId) -- only the asset it points at changes. Routed through
      // the real command gateway rather than a direct MCP call (Block H9 fix: this previously
      // bypassed isGatewayRoutable/dry-run/the client-side permission gate).
      await session.updateReference({ ...existing, assetId: registeredData.assetId });
      setReplaceStage("IDLE");
    } catch (error) {
      setReplaceStage("FAILED");
      setReplaceError(error instanceof Error ? error.message : "Reference replacement failed.");
    } finally {
      setReplacingReferenceId(undefined);
    }
  };

  const importControl = (
    <div className="reference-import">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importReference(file);
        }}
      />
      <button
        type="button"
        className="secondary-command"
        disabled={importStage === "UPLOADING" || importStage === "ANALYZING" || importStage === "IMPORTING"}
        onClick={() => fileInputRef.current?.click()}
      >
        Import reference
      </button>
      {importStage !== "IDLE" ? (
        <span className={`reference-import-status status-${importStage.toLowerCase()}`} aria-live="polite">
          {importStage === "UPLOADING"
            ? "Uploading…"
            : importStage === "ANALYZING"
              ? "Analyzing pixels (region detection + OCR)…"
              : importStage === "IMPORTING"
                ? "Creating editable layers…"
                : importMessage}
        </span>
      ) : null}
    </div>
  );

  const replaceFileInput = (
    <input
      ref={replaceFileInputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      style={{ display: "none" }}
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file && replacingReferenceId) void replaceReference(replacingReferenceId, file);
      }}
    />
  );

  const references = Object.values(snapshot.document.references);
  if (references.length === 0) {
    return (
      <div className="reference-panel empty">
        <p>No reference has been imported for this document yet.</p>
        {importControl}
        {replaceFileInput}
      </div>
    );
  }
  return (
    <div className="reference-panel">
      {importControl}
      {replaceFileInput}
      {replaceStage === "FAILED" ? (
        <p className="reference-replace-error" role="alert">
          {replaceError}
        </p>
      ) : null}
      {references.map((reference) => {
        const asset = snapshot.document.assets[reference.assetId];
        const validation = Object.values(snapshot.document.validations)
          .filter((record) => record.referenceIds.includes(reference.id))
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
        const overallScore = validation ? averageScore(validation.scores) : undefined;
        return (
          <div className="reference-entry" key={reference.id}>
            <div className="reference-thumb">
              <div className="reference-art">
                <span>{overallScore === undefined ? "—" : Math.round(overallScore * 100)}</span>
              </div>
            </div>
            <strong>{asset?.name ?? reference.id}</strong>
            <span>
              {asset?.dimensions
                ? `${asset.dimensions.width} × ${asset.dimensions.height}`
                : "Dimensions not available"}
              {asset?.mimeType ? ` · ${asset.mimeType}` : ""}
            </span>
            <span className="reference-status">
              {validation ? `Last evaluated ${validation.createdAt}` : "Not evaluated"}
            </span>
            <button
              type="button"
              className="secondary-command"
              disabled={replaceStage === "REPLACING"}
              onClick={() => {
                setReplacingReferenceId(reference.id);
                replaceFileInputRef.current?.click();
              }}
            >
              {replaceStage === "REPLACING" && replacingReferenceId === reference.id
                ? "Replacing…"
                : "Replace reference"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Real, deterministic delete-intent classification (Block D cleanup, Issue 2) — a rename request
 * that happens to mention "delete" in its new name (e.g. rename it to "Delete Me") is never treated
 * as a delete, matching the same rename-takes-precedence rule interpretNodeEditPrompt already
 * applies server-side (packages/agent-runtime/src/engine.ts).
 */
function isDeletePrompt(prompt: string): boolean {
  if (/rename(?: it| this)? to ["']?[^"'.]+["']?/i.test(prompt)) return false;
  return /\b(delete|remove)\b/i.test(prompt);
}

type AiStage = "IDLE" | "RUNNING" | "COMPLETE" | "FAILED";
const aiLabels: Record<AiStage, string> = {
  IDLE: "Ready",
  RUNNING: "Running",
  COMPLETE: "Complete",
  FAILED: "Failed",
};

/**
 * Describes what actually changed by comparing the node's state before and after a real agent run
 * — computed from real, applied results (Block D4), not a pre-flight guess made before the write
 * ever happened. Returns a generic fallback only when no tracked field actually differs (e.g. the
 * edit affected a property this summary doesn't track), never a fabricated description.
 */
function summarizeNodeChange(before: DesignNode, after: DesignNode | undefined): string {
  if (!after) return `Edited "${before.name}"`;
  if (before.name !== after.name) return `Rename "${before.name}" → "${after.name}"`;
  const beforePos = before.transform.position;
  const afterPos = after.transform.position;
  if (beforePos.x !== afterPos.x || beforePos.y !== afterPos.y) {
    return `Move "${after.name}" to (${Math.round(afterPos.x)}, ${Math.round(afterPos.y)})`;
  }
  const beforeDim = before.dimensions;
  const afterDim = after.dimensions;
  if (
    beforeDim &&
    afterDim &&
    (beforeDim.width.value !== afterDim.width.value || beforeDim.height.value !== afterDim.height.value)
  ) {
    return `Resize "${after.name}" to ${Math.round(afterDim.width.value)} × ${Math.round(afterDim.height.value)}`;
  }
  return `Edited "${after.name}"`;
}

export function AiPanel({
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
  const [pendingApproval, setPendingApproval] = useState<StudioPendingApproval | undefined>(undefined);
  const approvalControllerRef = useRef<ReturnType<typeof createInteractiveApprovalAdapter> | undefined>(undefined);
  const run = async () => {
    if (!prompt.trim()) {
      setStage("FAILED");
      setActions(["Enter an instruction."]);
      return;
    }
    // With a layer selected, edit that one node — exactly as before (Block D4). With NOTHING
    // selected, "Document context" (the label already shown below) becomes real: the prompt is
    // handed to the compound multi-operation planner (Block E), which resolves each of its own
    // clauses' targets from the actual current document instead of silently falling back to the
    // first root node, as this used to do.
    const compoundMode = selected.length === 0;
    const nodeId = selected[0] ?? "";
    const node = compoundMode ? undefined : snapshot.document.nodes[nodeId];
    if (!compoundMode && (!node || node.locked)) {
      setStage("FAILED");
      setActions([node?.locked ? "Selected node is locked." : "Select an editable layer and enter an instruction."]);
      return;
    }
    if (!compoundMode) onSelect(nodeId, false);
    const viewport = snapshot.document.settings.viewports[snapshot.viewportId];
    setStage("RUNNING");
    setActions([]);
    const correlationId = `studio_ai_${crypto.randomUUID()}`;
    try {
      // The raw prompt is handed to the real Agent Planner (Block D4) — it interprets the request
      // itself, at plan-execution time, after reading the node's real current state, rather than
      // Studio guessing client-side before any real read happens. An unrecognized prompt now fails
      // as a real plan-execution error (caught below) instead of a pre-flight UI guess.
      // A delete-shaped prompt (Block D cleanup, Issue 2) instead routes to the planner's existing
      // deletePlan — a destructive write that always requires real approval — rather than through
      // the update interpreter, which has no delete operation.
      const deleteRequested = !compoundMode && isDeletePrompt(prompt);
      const goal = createAgentGoal({
        category: "EDIT",
        request: prompt,
        targetProjectId: agentContext.projectId,
        targetDocumentId: agentContext.documentId,
        targetNodeIds: compoundMode ? [] : [nodeId],
        parameters: compoundMode
          ? { operation: "compound_edit", prompt }
          : deleteRequested
            ? { operation: "delete" }
            : { prompt, viewportWidth: viewport?.width ?? 1440 },
      });
      const agentSession = createAgentSession({
        actorId: agentContext.actorId,
        workspaceId: agentContext.workspaceId,
        projectId: agentContext.projectId,
        documentId: agentContext.documentId,
        goal,
        createdAt: new Date().toISOString(),
      });
      // A real, human-in-the-loop approval adapter (Block D5) — decide() genuinely suspends until
      // the user clicks Approve/Reject in the UI below, rather than the previous
      // createDeterministicApprovalAdapter() with no arguments, which auto-rejected every
      // approval-gated step since its approvedStepIds/approvedTools sets were always empty. The
      // real AGENT_APPROVAL_POLICY-derived policy (agentContext.approvalPolicy) decides whether
      // this specific edit needs approval at all — a safe write under the default AUTO_SAFE_WRITE
      // policy proceeds automatically, same as before.
      const approvalController = createInteractiveApprovalAdapter();
      approvalControllerRef.current = approvalController;
      const unsubscribeApproval = approvalController.subscribe(() =>
        setPendingApproval(approvalController.getPending()),
      );
      const engine = createAgentEngine({
        reasoningProvider: createDeterministicReasoningProvider({ approvalPolicy: agentContext.approvalPolicy }),
        mcpClient: agentContext.createMcpClient(correlationId),
        approvalAdapter: approvalController.adapter,
        persistence: createInMemoryAgentPersistence(),
      });
      let result: Awaited<ReturnType<typeof engine.execute>>;
      try {
        result = await engine.execute({
          session: agentSession,
          contextRecords: [],
          actorPermissions: agentContext.actorPermissions,
        });
      } finally {
        unsubscribeApproval();
        approvalControllerRef.current = undefined;
        setPendingApproval(undefined);
      }
      if (result.run.status !== "SUCCEEDED") {
        setStage("FAILED");
        setActions([
          result.run.outcome?.summary ?? `Agent run ended with status ${result.run.status}.`,
          ...(result.run.outcome?.diagnostics.map((entry) => entry.message) ?? []),
        ]);
        return;
      }
      // The real engine writes through its own MCP client, independent of session's local
      // ProjectStore. In REMOTE (production) mode that client never touches session, so resync
      // from a real document.get read — the server's actual result, not a locally re-derived
      // guess (Block D4: the interpreted changes are no longer known to Studio at all, since the
      // real planner computed them server-side). In LOCAL (dev-fixture) mode the in-process
      // transport already applied it via session.updateNode/registerToken as part of simulating
      // each tool call.
      let afterNode = compoundMode ? undefined : session.getSnapshot().document.nodes[nodeId];
      if (session.mode === "REMOTE") {
        const read = await agentContext.createMcpClient(correlationId).invoke("document.get", { projection: "full" });
        if (read.success && read.data !== undefined) {
          const document = CanonicalDesignDocumentSchema.parse(read.data);
          session.resyncDocument(document);
          afterNode = compoundMode ? undefined : document.nodes[nodeId];
        }
      }
      const toolSteps = result.audits.filter((entry) => entry.tool && entry.tool !== "system.get_capabilities");
      if (compoundMode) {
        // No single before/after node to diff — report the real, observed set of committed writes
        // instead (each already tool + outcome, from the actual engine run, not guessed). Counts
        // only COMMITTED writes, not their preceding dry-runs — both share the same tool name in
        // this audit list, so counting by tool alone would double the real number of changes.
        const updatedCount = toolSteps.filter(
          (entry) => entry.tool === "node.update" && entry.writeStatus === "COMMITTED",
        ).length;
        const tokenCount = toolSteps.filter(
          (entry) => entry.tool === "token.register" && entry.writeStatus === "COMMITTED",
        ).length;
        setActions([
          `Applied ${updatedCount} layer change${updatedCount === 1 ? "" : "s"}` +
            (tokenCount > 0 ? ` (registered ${tokenCount} new color token${tokenCount === 1 ? "" : "s"})` : ""),
          ...toolSteps.map((entry) => `${entry.tool} — ${entry.toolResult.toLowerCase()}`),
          `Canonical document advanced to v${result.run.outcome?.finalDocumentVersion ?? snapshot.document.documentVersion + 1}`,
        ]);
        setStage("COMPLETE");
        setPrompt("");
        return;
      }
      // A delete is reported from the real, observed tool call (never inferred from afterNode being
      // undefined, which could also mean a resync race) — and clears selection, since the selected
      // node genuinely no longer exists.
      const wasDelete = toolSteps.some((entry) => entry.tool === "node.delete");
      if (wasDelete) onSelect("", false);
      setActions([
        wasDelete ? `Deleted "${node?.name}"` : summarizeNodeChange(node as DesignNode, afterNode),
        ...toolSteps.map((entry) => `${entry.tool} — ${entry.toolResult.toLowerCase()}`),
        `Canonical document advanced to v${result.run.outcome?.finalDocumentVersion ?? snapshot.document.documentVersion + 1}`,
      ]);
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
      {pendingApproval ? (
        <div className="ai-approval" role="alertdialog" aria-label="Action awaiting approval">
          <strong>Approval required</strong>
          {/* summary/operation/nodeId/before/after are real, derived plan-execution context
              (post-D5 cleanup) — read directly from the actual read-before-write step data, not
              re-guessed here. Fall back to the raw tool name only if the engine genuinely couldn't
              derive richer context (e.g. a write with no preceding read). */}
          <p>{pendingApproval.request.summary ?? `The agent wants to run ${pendingApproval.request.tool}.`}</p>
          {pendingApproval.request.operation ? (
            <p className="approval-operation">{pendingApproval.request.operation}</p>
          ) : null}
          {pendingApproval.request.before && pendingApproval.request.after ? (
            <dl className="approval-diff">
              {Object.keys(pendingApproval.request.after)
                .filter(
                  (key) =>
                    JSON.stringify((pendingApproval.request.before as Record<string, unknown>)[key]) !==
                    JSON.stringify((pendingApproval.request.after as Record<string, unknown>)[key]),
                )
                .map((key) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>
                      {JSON.stringify((pendingApproval.request.before as Record<string, unknown>)[key])} →{" "}
                      {JSON.stringify((pendingApproval.request.after as Record<string, unknown>)[key])}
                    </dd>
                  </div>
                ))}
            </dl>
          ) : null}
          <p
            className={`approval-classification classification-${pendingApproval.request.classification.toLowerCase()}`}
          >
            {pendingApproval.request.classification === "DESTRUCTIVE_WRITE"
              ? "This is a destructive action and cannot be undone through this flow."
              : "This is a safe, reversible write."}
          </p>
          <div className="approval-buttons">
            <button type="button" className="approval-approve" onClick={() => approvalControllerRef.current?.approve()}>
              Approve
            </button>
            <button
              type="button"
              className="approval-reject"
              onClick={() => approvalControllerRef.current?.reject("Rejected by user in Studio.")}
            >
              Reject
            </button>
          </div>
        </div>
      ) : null}
      <div className="ai-actions" aria-live="polite">
        {actions.length ? (
          // `actions` is always replaced wholesale by setActions(...) on each run (never incrementally
          // appended/reordered), so the index is a genuinely stable identity here; the content alone
          // isn't unique (e.g. repeated "node.update — succeeded" entries from a multi-clause compound
          // edit), which is what caused a real React duplicate-key warning found via live Studio
          // testing (Block G, G5).
          actions.map((action, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: see comment above the .map() call
            <div key={`${index}:${action}`}>
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
  const isText = node.type === "TEXT";
  const operationPaint =
    operation?.kind === "PAINT"
      ? operation.style.fills[0]
      : operation?.kind === "VECTOR"
        ? operation.fills[0]
        : undefined;
  const operationStroke = operation?.kind === "PAINT" ? operation.style.strokes[0] : undefined;
  // A TEXT node's resolved paint is its glyph color (runs[0].style.fillTokenId), not a background —
  // painting it onto `background` would color the whole textarea box instead of the text itself.
  const fill =
    (!isText ? paintCss(operationPaint) : undefined) ??
    (typeof custom["aevum.studio.fill"] === "string" ? custom["aevum.studio.fill"] : "transparent");
  const color =
    (isText ? paintCss(operationPaint) : undefined) ??
    (typeof custom["aevum.studio.color"] === "string" ? custom["aevum.studio.color"] : "#e9ece8");
  // node.geometry.cornerRadius is real sampled data from reconstruction (see
  // packages/reconstruction/src/proposal.ts) when present; an explicit Studio override always wins.
  const geometryCornerRadius =
    node.type === "SHAPE" && typeof (node.geometry as { cornerRadius?: unknown }).cornerRadius === "number"
      ? (node.geometry as { cornerRadius: number }).cornerRadius
      : undefined;
  const radius =
    typeof custom["aevum.studio.radius"] === "number" ? custom["aevum.studio.radius"] : (geometryCornerRadius ?? 0);
  // node.geometry.stroke.width is real sampled data from reconstruction (see
  // packages/reconstruction-vision/manifest.ts's stroke sampling) — the canonical schema has no
  // typed strokeWidth field yet, so it's read directly here, the same pattern as cornerRadius above.
  const geometryStrokeWidth =
    node.type === "SHAPE" && typeof (node.geometry as { stroke?: { width?: unknown } }).stroke?.width === "number"
      ? (node.geometry as { stroke: { width: number } }).stroke.width
      : undefined;
  const strokeCss = operationStroke ? paintCss(operationStroke.paint) : undefined;
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
    ...(strokeCss
      ? {
          border: `${geometryStrokeWidth ?? operationStroke?.width ?? 1}px solid ${strokeCss}`,
          boxSizing: "border-box",
        }
      : {}),
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
              // A font pick alone is not a measurement: real match status (EXACT/LIKELY_MATCH/
              // CLOSE_SUBSTITUTE) comes from packages/fidelity's rankFontCandidates(), which compares
              // real rendered glyph advances against a reference — nothing that's happened yet at
              // pick time. UNKNOWN is the honest default until a real fidelity measurement runs.
              fontMatchStatus: "UNKNOWN",
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
        <span /> {style.fontFamily} · {style.fontMatchStatus.toLowerCase().replace(/_/g, " ")}
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

export function FidelityWorkspace({ snapshot }: { snapshot: StudioSessionSnapshot }) {
  const viewport = snapshot.document.settings.viewports[snapshot.viewportId];
  const validation = Object.values(snapshot.document.validations).sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  )[0];
  const averageOf = averageScore(validation?.scores ?? {});
  const reference = Object.values(snapshot.document.references)[0];
  const [measureStage, setMeasureStage] = useState<"IDLE" | "MEASURING" | "FAILED">("IDLE");
  const [measureError, setMeasureError] = useState("");

  const runMeasurement = async () => {
    if (!reference) return;
    setMeasureStage("MEASURING");
    setMeasureError("");
    try {
      const correlationId = `studio_fidelity_${crypto.randomUUID()}`;
      const client = agentContext.createMcpClient(correlationId);
      const measured = await client.invoke(
        "fidelity.measure",
        {
          expectedDocumentVersion: snapshot.document.documentVersion,
          referenceAssetId: reference.assetId,
          profile: "STANDARD",
        },
        { idempotencyKey: `${correlationId}-measure` },
      );
      if (!measured.success || measured.data === undefined) {
        throw new Error(measured.errors[0]?.message ?? "Fidelity measurement failed.");
      }
      const read = await client.invoke("document.get", { projection: "full" });
      if (!read.success || read.data === undefined) {
        throw new Error(read.errors[0]?.message ?? "Could not reload the document after measurement.");
      }
      session.resyncDocument(CanonicalDesignDocumentSchema.parse(read.data));
      setMeasureStage("IDLE");
    } catch (error) {
      setMeasureStage("FAILED");
      setMeasureError(error instanceof Error ? error.message : "Fidelity measurement failed.");
    }
  };

  return (
    <main className="fidelity-workspace">
      <header>
        <div>
          <strong>Maximum Fidelity</strong>
          <span>{viewport ? `${viewport.width} × ${viewport.height}` : "No active viewport"}</span>
        </div>
        <div className="comparison-tabs">
          <button type="button">Reference</button>
          <button type="button" className="active">
            Overlay
          </button>
          <button type="button">Heatmap</button>
        </div>
        {reference ? (
          <button
            type="button"
            className="secondary-command"
            disabled={measureStage === "MEASURING"}
            onClick={() => void runMeasurement()}
          >
            {measureStage === "MEASURING" ? "Measuring…" : "Run fidelity measurement"}
          </button>
        ) : null}
      </header>
      {measureStage === "FAILED" ? (
        <p className="fidelity-measure-error" role="alert">
          {measureError}
        </p>
      ) : null}
      <div className="fidelity-body">
        {validation ? (
          <>
            <section className="comparison-view">
              <p>
                Comparison rendering for report {validation.id} is not implemented in this view yet. Domain scores below
                reflect the stored Maximum Fidelity report.
              </p>
            </section>
            <aside className="score-panel">
              <div className="score-ring">
                <strong>{averageOf === undefined ? "—" : Math.round(averageOf * 100)}</strong>
                <span>Average of {Object.keys(validation.scores).length} domain score(s)</span>
              </div>
              <div className="score-meta">
                <span>
                  Status <b>{validation.status}</b>
                </span>
                <span>
                  Evaluated <b>{validation.createdAt}</b>
                </span>
              </div>
              <div className="domain-bars">
                {Object.entries(validation.scores).map(([domain, score]) => (
                  <div key={domain} className="domain-bar">
                    <span>
                      <b>{domain}</b>
                    </span>
                    <strong>{Math.round(score * 100)}</strong>
                    <i>
                      <em style={{ width: `${score * 100}%` }} />
                    </i>
                  </div>
                ))}
              </div>
            </aside>
          </>
        ) : (
          <div className="fidelity-empty">
            <p>Not evaluated. No Maximum Fidelity report has been generated for this document yet.</p>
          </div>
        )}
      </div>
    </main>
  );
}

function App({
  account,
}: {
  account?: {
    email: string;
    workspaceId: string;
    projectId: string;
    documentId: string;
    onSignOut(): void;
    onCopy(value: string): void;
    onCopyToken(): void;
  };
}) {
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
      {account ? (
        <section className="production-session" aria-label="Production session">
          <span title={account.workspaceId}>{account.email}</span>
          <button type="button" onClick={() => account.onCopy(account.workspaceId)}>
            Workspace ID
          </button>
          <button type="button" onClick={() => account.onCopy(account.projectId)}>
            Project ID
          </button>
          <button type="button" onClick={() => account.onCopy(account.documentId)}>
            Document ID
          </button>
          <button type="button" onClick={account.onCopyToken}>
            Copy MCP credential
          </button>
          <button type="button" onClick={account.onSignOut}>
            Sign out
          </button>
        </section>
      ) : null}
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
          <Suspense
            fallback={
              <div className="boot-shell">
                <span>Loading 3D workspace...</span>
              </div>
            }
          >
            <ThreeViewport snapshot={snapshot} selected={selected} onSelect={select} />
          </Suspense>
        ) : workspace === "FIDELITY" ? (
          <FidelityWorkspace snapshot={snapshot} />
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

function SignIn({ client }: { client: SupabaseClient }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const authenticate = async (create: boolean) => {
    setBusy(true);
    setMessage("");
    const result = create
      ? await client.auth.signUp({ email, password })
      : await client.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (create && !result.data.session) setMessage("Check your email to confirm the account.");
  };
  return (
    <main className="auth-shell">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void authenticate(false);
        }}
      >
        <div className="auth-brand">
          <strong>AEVUM</strong>
          <span>Studio</span>
        </div>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {message ? <p role="alert">{message}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={() => void authenticate(true)}>
          Create account
        </button>
      </form>
    </main>
  );
}

export function ProductionBootstrap({ configuration }: { configuration: StudioBrowserConfiguration }) {
  const [client] = useState(() => createStudioAuthClient(configuration));
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof loadProductionStudioProject>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    void client.auth.getSession().then(({ data }) => {
      sessionRef.current = data.session;
      setAuthSession(data.session);
      setLoading(false);
    });
    // Supabase emits a new Session object (and a TOKEN_REFRESHED event) whenever a background
    // token refresh runs, e.g. right after the tab regains focus. sessionRef always tracks the
    // latest token for outgoing MCP calls, but authSession (and the project reload it triggers)
    // only changes when the signed-in identity actually changes, so a routine refresh no longer
    // tears down and re-fetches the whole canonical project.
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      const previousUserId = sessionRef.current?.user.id;
      sessionRef.current = next;
      if (next?.user.id !== previousUserId) {
        setAuthSession(next);
        if (!next) setLoaded(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [client]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    addEventListener("online", update);
    addEventListener("offline", update);
    return () => {
      removeEventListener("online", update);
      removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    // The client-side capability pre-check taken at bootstrap was previously a single snapshot for
    // the whole session (Block D completeness) — a mid-session role change (an admin downgrading
    // this user) wouldn't show up client-side until the next full reload. Re-fetching on tab return
    // keeps it fresh without tearing down the whole project the way an identity change does. Never
    // throws into the render: this is a best-effort background refresh, not a blocking operation,
    // and the server independently re-checks every write regardless of what this client-side cache
    // says.
    const refresh = () => {
      if (document.visibilityState === "visible") void loaded?.refreshCapabilities().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [loaded]);
  useEffect(() => {
    if (!authSession) return;
    setLoading(true);
    setError("");
    void loadProductionStudioProject(configuration, authSession, () => sessionRef.current?.access_token ?? "")
      .then((project) => {
        session = createStudioSession({
          project: project.project,
          document: project.document,
          persistence: storage,
          commandGateway: project.commandGateway,
          restoreFromPersistence: false,
        });
        agentContext = project.agentContext;
        setLoaded(project);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Studio startup failed."))
      .finally(() => setLoading(false));
  }, [authSession, configuration]);
  if (loading)
    return (
      <main className="boot-shell">
        <strong>AEVUM Studio</strong>
        <span>Opening canonical project...</span>
      </main>
    );
  if (!authSession) return <SignIn client={client} />;
  if (error || !loaded)
    return (
      <main className="boot-shell" role="alert">
        <strong>Project unavailable</strong>
        <span>{error}</span>
        <button type="button" onClick={() => location.reload()}>
          Retry
        </button>
      </main>
    );
  return (
    <>
      {!online ? (
        <div className="offline-banner" role="status">
          Offline. Editing is paused until the connection returns.
        </div>
      ) : null}
      <App
        account={{
          email: authSession.user.email ?? "Authenticated account",
          workspaceId: loaded.workspaceId,
          projectId: loaded.project.id,
          documentId: loaded.document.metadata.id,
          onSignOut: () => {
            void client.auth.signOut();
          },
          onCopy: (value) => {
            void navigator.clipboard.writeText(value);
          },
          onCopyToken: () => {
            void navigator.clipboard.writeText(authSession.access_token);
          },
        }}
      />
    </>
  );
}

export function StudioRoot() {
  try {
    const configuration = readStudioBrowserConfiguration();
    return <ProductionBootstrap configuration={configuration} />;
  } catch (error) {
    if (import.meta.env.DEV) {
      const fixture = createStudioProjectFixture();
      session = createStudioSession({ ...fixture, persistence: storage });
      agentContext = createDeterministicStudioAgentContext({
        session,
        workspaceId: fixture.project.workspaceId,
        projectId: fixture.project.id,
        documentId: fixture.document.metadata.id,
        actorId: "studio-dev-actor",
      });
      return <App />;
    }
    return (
      <main className="boot-shell" role="alert">
        <strong>Studio configuration unavailable</strong>
        <span>{error instanceof Error ? error.message : "Invalid public runtime configuration."}</span>
      </main>
    );
  }
}
