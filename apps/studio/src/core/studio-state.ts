import { z } from "zod";

export const StudioToolSchema = z.enum(["SELECT", "FRAME", "TEXT", "SHAPE", "IMAGE", "VECTOR", "HAND"]);
export const StudioWorkspaceSchema = z.enum(["DESIGN", "ANIMATION", "THREE_D", "FIDELITY"]);
export const StudioPanelSchema = z.enum(["LAYERS", "ASSETS", "COMPONENTS", "REFERENCES", "AI"]);
export type StudioTool = z.infer<typeof StudioToolSchema>;
export type StudioWorkspace = z.infer<typeof StudioWorkspaceSchema>;
export type StudioPanel = z.infer<typeof StudioPanelSchema>;

export interface StudioViewportState {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export interface StudioTransientState {
  readonly activeTool: StudioTool;
  readonly workspace: StudioWorkspace;
  readonly leftPanel: StudioPanel;
  readonly selectedNodeIds: readonly string[];
  readonly expandedNodeIds: ReadonlySet<string>;
  readonly viewport: StudioViewportState;
  readonly timelineOpen: boolean;
  readonly playhead: number;
  readonly reducedMotion: boolean;
}

export function createStudioTransientState(rootIds: readonly string[]): StudioTransientState {
  return Object.freeze({
    activeTool: "SELECT",
    workspace: "DESIGN",
    leftPanel: "LAYERS",
    selectedNodeIds: Object.freeze([]),
    expandedNodeIds: new Set(rootIds),
    viewport: Object.freeze({ zoom: 0.55, panX: 0, panY: 0 }),
    timelineOpen: false,
    playhead: 1.1,
    reducedMotion: false,
  });
}

export function snapValue(value: number, targets: readonly number[], threshold = 6): number {
  let best: number | undefined;
  let distance = threshold + Number.EPSILON;
  for (const target of targets) {
    const candidateDistance = Math.abs(target - value);
    if (candidateDistance <= threshold && candidateDistance < distance) {
      best = target;
      distance = candidateDistance;
    }
  }
  return best ?? Math.round(value);
}
