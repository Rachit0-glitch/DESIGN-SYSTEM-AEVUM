/**
 * Deterministic, rule-based parsing of a compound design-edit prompt ("make the headline larger,
 * move the product slightly right, change the background to orange and add a thin black border")
 * into a fixed list of independent, classifiable clauses — no LLM, no network call, pure text
 * analysis. This module is intentionally standalone (imported by both intent.ts, for pre-planning
 * ambiguity checks, and deterministic.ts, for plan generation) so neither of those two peer modules
 * needs to import the other.
 *
 * Splitting and operation/target classification happen here, at plan-generation time, from the
 * prompt text alone — this is what lets the resulting AgentPlan have a fixed, known step count
 * before any document read happens. Resolving a target KEYWORD to a real node id, and computing the
 * exact numeric changes from that node's real current state, happens later, inside the
 * RESOLVE_COMPOUND_EDIT analyze step (packages/agent-runtime/src/engine.ts) — the same
 * read-before-interpret discipline Block D4's interpretNodeEditPrompt already established for
 * single-node edits, just extended to several independent targets in one plan.
 */

export type CompoundEditOperationKind = "RESIZE" | "MOVE" | "RECOLOR_FILL" | "ADD_BORDER" | "RENAME";

export interface CompoundEditClause {
  readonly raw: string;
  /** Undefined means "no target noun found in this clause" — resolved via anaphora (the previous
   * clause's real resolved target) at analyze time, not guessed here. */
  readonly targetKeyword?: string;
  readonly operation: CompoundEditOperationKind;
  readonly params: Readonly<Record<string, unknown>>;
  readonly needsToken: boolean;
}

export interface CompoundEditParseResult {
  readonly clauses: readonly CompoundEditClause[];
  /** Non-empty only when the prompt genuinely could not be turned into a plan: no clauses at all,
   * a clause with no classifiable operation, or a first clause with nothing to resolve its target
   * against. Real, human-readable, and specific to what failed — never a generic catch-all. */
  readonly diagnostics: readonly string[];
}

export const NAMED_COLORS: Readonly<Record<string, Readonly<{ r: number; g: number; b: number }>>> = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 255, g: 255, b: 255 },
  red: { r: 220, g: 38, b: 38 },
  orange: { r: 234, g: 88, b: 12 },
  yellow: { r: 234, g: 179, b: 8 },
  green: { r: 22, g: 163, b: 74 },
  blue: { r: 37, g: 99, b: 235 },
  purple: { r: 147, g: 51, b: 234 },
  pink: { r: 236, g: 72, b: 153 },
  brown: { r: 120, g: 72, b: 36 },
  gray: { r: 107, g: 114, b: 128 },
  grey: { r: 107, g: 114, b: 128 },
};

// Deliberately excludes "border"/"stroke"/"outline" — those name a PROPERTY being added, not a
// target entity, so a clause like "add a thin black border" (with no noun of its own) correctly
// falls through to anaphora and inherits whatever the previous clause targeted.
const TARGET_KEYWORDS = [
  "headline",
  "title",
  "product",
  "image",
  "photo",
  "picture",
  "background",
  "backdrop",
  "text",
  "body",
  "copy",
  "logo",
  "frame",
  "button",
  "card",
] as const;

function extractColor(text: string): { r: number; g: number; b: number } | undefined {
  const hex = text.match(/#([0-9a-f]{6})/i);
  if (hex?.[1]) {
    const value = hex[1];
    return {
      r: Number.parseInt(value.slice(0, 2), 16),
      g: Number.parseInt(value.slice(2, 4), 16),
      b: Number.parseInt(value.slice(4, 6), 16),
    };
  }
  for (const [name, rgb] of Object.entries(NAMED_COLORS)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(text)) return rgb;
  }
  return undefined;
}

function extractTargetKeyword(raw: string): string | undefined {
  const lower = raw.toLowerCase();
  return TARGET_KEYWORDS.find((keyword) => new RegExp(`\\b${keyword}\\b`).test(lower));
}

function classifyClause(
  raw: string,
): { operation: CompoundEditOperationKind; params: Record<string, unknown>; needsToken: boolean } | undefined {
  const text = raw.toLowerCase();
  const renameMatch = raw.match(/rename(?: it| this)? to ["']?([^"'.]+)["']?/i);
  if (renameMatch?.[1]?.trim()) {
    return { operation: "RENAME", params: { name: renameMatch[1].trim() }, needsToken: false };
  }
  if (/\b(border|stroke|outline)\b/.test(text)) {
    const color = extractColor(text) ?? NAMED_COLORS.black;
    const widthMatch = text.match(/(\d+(?:\.\d+)?)\s*px/);
    const width = widthMatch?.[1] ? Number(widthMatch[1]) : /\bthick/.test(text) ? 4 : /\bthin/.test(text) ? 1 : 2;
    return { operation: "ADD_BORDER", params: { color, width }, needsToken: true };
  }
  const color = extractColor(text);
  if (color) {
    return { operation: "RECOLOR_FILL", params: { color }, needsToken: true };
  }
  if (/\b(bigger|larger|grow|smaller|shrink)\b/.test(text)) {
    const bigger = /\b(bigger|larger|grow)\b/.test(text);
    const pctMatch = text.match(/(\d+)\s*%/);
    const factor = pctMatch?.[1]
      ? bigger
        ? 1 + Number(pctMatch[1]) / 100
        : 1 - Number(pctMatch[1]) / 100
      : bigger
        ? 1.2
        : 0.8;
    return { operation: "RESIZE", params: { factor }, needsToken: false };
  }
  const directionMatch = text.match(/\b(left|right|up|down)\b/);
  if (directionMatch?.[1]) {
    const pxMatch = text.match(/(\d+)\s*px/);
    const distance = pxMatch?.[1]
      ? Number(pxMatch[1])
      : /\b(slightly|a bit|a little)\b/.test(text)
        ? 12
        : /\b(a lot|far|significantly)\b/.test(text)
          ? 80
          : 20;
    return { operation: "MOVE", params: { direction: directionMatch[1], distance }, needsToken: false };
  }
  return undefined;
}

export function parseCompoundEditClauses(prompt: string): CompoundEditParseResult {
  const rawClauses = prompt
    .split(/\s*,\s*|\s+and\s+/i)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (rawClauses.length === 0) {
    return { clauses: [], diagnostics: ["The prompt contains no recognizable clauses to edit."] };
  }
  const clauses: CompoundEditClause[] = [];
  const diagnostics: string[] = [];
  for (const raw of rawClauses) {
    const classified = classifyClause(raw);
    if (!classified) {
      diagnostics.push(
        `Could not map "${raw}" to a supported operation (resize, move, recolor fill, add a border, or rename).`,
      );
      continue;
    }
    const targetKeyword = extractTargetKeyword(raw);
    clauses.push({ raw, ...(targetKeyword ? { targetKeyword } : {}), ...classified });
  }
  if (clauses.length > 0 && clauses[0]?.targetKeyword === undefined) {
    diagnostics.push(`"${clauses[0]?.raw}" does not name a target and there is no earlier clause to continue from.`);
  }
  return { clauses, diagnostics };
}
