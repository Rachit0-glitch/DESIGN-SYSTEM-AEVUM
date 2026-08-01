import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly file?: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly issues: ValidationIssue[];
}

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFile), "..");

const CANONICAL_PRODUCT_NAME = "AEVUM AI Reconstruction Engine";

const CANONICAL_TERMS = [
  "AEVUM AI Reconstruction Engine",
  "Maximum Fidelity",
  "Canonical Design Document",
  "MCP",
  "Hybrid 2D Renderer",
  "3D Engine",
  "Reconstruction Pipeline",
  "Visual Validation",
  "Autonomous Correction Loop",
  "Multi-Stack Export",
  "Canva Export",
  "Command Engine",
] as const;

const requiredDocs = [
  "00_PROJECT_CONTEXT.md",
  "01_PRODUCT_REQUIREMENTS.md",
  "02_SYSTEM_ARCHITECTURE.md",
  "03_DESIGN_DOCUMENT_MODEL.md",
  "04_RECONSTRUCTION_PIPELINE.md",
  "05_TYPOGRAPHY_AND_ASSETS.md",
  "06_ANIMATION_AND_RENDERING.md",
  "07_3D_ENGINE_AND_CINEMATICS.md",
  "08_MCP_SPECIFICATION.md",
  "09_VISUAL_VALIDATION.md",
  "10_EXPORT_SYSTEM.md",
  "11_ROADMAP_AND_STATUS.md",
] as const;

const allowedStatuses = new Set([
  "NOT_STARTED",
  "PLANNED",
  "IN_PROGRESS",
  "BLOCKED",
  "IN_REVIEW",
  "VALIDATED",
  "DEFERRED",
  "CANCELLED",
]);

function relative(filePath: string): string {
  return path.relative(repoRoot, filePath).replaceAll("\\", "/");
}

function readDoc(fileName: string): string {
  return readFileSync(path.join(repoRoot, "docs", fileName), "utf8");
}

function addIssue(issues: ValidationIssue[], code: string, message: string, file?: string): void {
  issues.push({ code, message, file });
}

function validateRequiredFiles(issues: ValidationIssue[]): void {
  for (const fileName of requiredDocs) {
    const fullPath = path.join(repoRoot, "docs", fileName);
    if (!existsSync(fullPath)) {
      addIssue(issues, "DOC_MISSING", `Required documentation file is missing: docs/${fileName}`, `docs/${fileName}`);
    }
  }
}

function validateDuplicateNumberedDocs(issues: ValidationIssue[]): void {
  const docsDir = path.join(repoRoot, "docs");
  const files = readdirSync(docsDir).filter((entry) => statSync(path.join(docsDir, entry)).isFile());
  const numbers = new Map<string, string[]>();

  for (const fileName of files) {
    const match = /^(?<number>\d{2})_[A-Z0-9_]+\.md$/.exec(fileName);
    if (!match?.groups) {
      continue;
    }

    const current = numbers.get(match.groups.number) ?? [];
    current.push(fileName);
    numbers.set(match.groups.number, current);
  }

  for (const [number, matches] of numbers.entries()) {
    if (matches.length > 1) {
      addIssue(
        issues,
        "DOC_DUPLICATE_NUMBER",
        `Duplicate numbered documentation files for ${number}: ${matches.join(", ")}`,
      );
    }
  }

  const actualRequired = new Set(requiredDocs);
  for (const fileName of files) {
    if (/^\d{2}_/.test(fileName) && !actualRequired.has(fileName as (typeof requiredDocs)[number])) {
      addIssue(
        issues,
        "DOC_UNEXPECTED_NUMBERED_FILE",
        `Unexpected numbered documentation file: docs/${fileName}`,
        `docs/${fileName}`,
      );
    }
  }
}

function validateRequiredHeadings(issues: ValidationIssue[]): void {
  for (const fileName of requiredDocs) {
    const content = readDoc(fileName);
    if (!content.startsWith(`# ${CANONICAL_PRODUCT_NAME}`)) {
      addIssue(
        issues,
        "DOC_BAD_TITLE",
        `Documentation title must start with "# ${CANONICAL_PRODUCT_NAME}".`,
        `docs/${fileName}`,
      );
    }

    if (!/^## 1\. Purpose/m.test(content) && !/^## 1\. Purpose of This Document/m.test(content)) {
      addIssue(
        issues,
        "DOC_MISSING_PURPOSE",
        "Documentation file must contain a first Purpose heading.",
        `docs/${fileName}`,
      );
    }
  }

  const roadmap = readDoc("11_ROADMAP_AND_STATUS.md");
  for (const heading of ["## 3. Status Values", "## 6. Phase 0", "## 41. Definition of Done"]) {
    if (!roadmap.includes(heading)) {
      addIssue(
        issues,
        "ROADMAP_MISSING_HEADING",
        `Roadmap is missing required heading prefix: ${heading}`,
        "docs/11_ROADMAP_AND_STATUS.md",
      );
    }
  }

  const architecture = readDoc("02_SYSTEM_ARCHITECTURE.md");
  if (!architecture.includes("## 8. Dependency Rules")) {
    addIssue(
      issues,
      "ARCHITECTURE_MISSING_DEPENDENCY_RULES",
      "System architecture must define dependency rules.",
      "docs/02_SYSTEM_ARCHITECTURE.md",
    );
  }
}

function validateCanonicalTerminology(issues: ValidationIssue[]): void {
  const docsToCheck = [
    "00_PROJECT_CONTEXT.md",
    "01_PRODUCT_REQUIREMENTS.md",
    "02_SYSTEM_ARCHITECTURE.md",
    "11_ROADMAP_AND_STATUS.md",
  ];

  for (const fileName of docsToCheck) {
    const content = readDoc(fileName);
    if (!content.includes(CANONICAL_PRODUCT_NAME)) {
      addIssue(
        issues,
        "DOC_MISSING_PRODUCT_NAME",
        `Canonical product name is missing: ${CANONICAL_PRODUCT_NAME}`,
        `docs/${fileName}`,
      );
    }
  }

  const context = readDoc("00_PROJECT_CONTEXT.md");
  for (const term of CANONICAL_TERMS) {
    if (!context.includes(term)) {
      addIssue(
        issues,
        "DOC_MISSING_CANONICAL_TERM",
        `Project context is missing canonical term: ${term}`,
        "docs/00_PROJECT_CONTEXT.md",
      );
    }
  }

  const bannedAlternates = [
    "AEVUM Reconstruction Engine",
    "Aevum AI Reconstruction Engine",
    "Aevum Reconstruction Engine",
    "Maximum fidelity",
  ];

  for (const fileName of requiredDocs) {
    const content = readDoc(fileName);
    for (const alternate of bannedAlternates) {
      if (content.includes(alternate)) {
        addIssue(issues, "DOC_NON_CANONICAL_TERM", `Non-canonical terminology found: ${alternate}`, `docs/${fileName}`);
      }
    }
  }
}

function resolveMarkdownReference(sourceFile: string, rawReference: string): string | undefined {
  const withoutFragment = rawReference.split("#")[0];
  if (!withoutFragment || withoutFragment.startsWith("http") || withoutFragment.startsWith("mailto:")) {
    return undefined;
  }

  if (withoutFragment.startsWith("docs/")) {
    return path.join(repoRoot, withoutFragment);
  }

  if (withoutFragment.endsWith(".md")) {
    return path.resolve(path.dirname(path.join(repoRoot, sourceFile)), withoutFragment);
  }

  return undefined;
}

function validateInternalFileReferences(issues: ValidationIssue[]): void {
  const docsDir = path.join(repoRoot, "docs");
  const docs = readdirSync(docsDir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => `docs/${entry}`);

  const referencePatterns = [/`([^`]+\.md(?:#[^`]*)?)`/g, /\[[^\]]+\]\(([^)]+\.md(?:#[^)]+)?)\)/g];

  for (const doc of docs) {
    const content = readFileSync(path.join(repoRoot, doc), "utf8");
    for (const pattern of referencePatterns) {
      for (const match of content.matchAll(pattern)) {
        const reference = match[1];
        if (!reference) {
          continue;
        }

        const resolved = resolveMarkdownReference(doc, reference);
        if (resolved && !existsSync(resolved)) {
          addIssue(issues, "DOC_BROKEN_REFERENCE", `Broken internal Markdown reference: ${reference}`, doc);
        }
      }
    }
  }
}

function extractPhaseStatus(phaseBlock: string): string | undefined {
  const statusMatch = /### Status\s+```(?:text)?\s*(?<status>[A-Z_]+)\s*```/m.exec(phaseBlock);
  return statusMatch?.groups?.status;
}

function validateRoadmapPhases(issues: ValidationIssue[]): void {
  const roadmap = readDoc("11_ROADMAP_AND_STATUS.md");
  const phaseMatches = [...roadmap.matchAll(/^## \d+\. Phase (?<phase>\d+) /gm)];
  const phaseNumbers = phaseMatches.map((match) => Number(match.groups?.phase));

  for (let phase = 0; phase <= 30; phase += 1) {
    if (!phaseNumbers.includes(phase)) {
      addIssue(issues, "ROADMAP_MISSING_PHASE", `Roadmap is missing Phase ${phase}.`, "docs/11_ROADMAP_AND_STATUS.md");
    }
  }

  for (let index = 0; index < phaseMatches.length; index += 1) {
    const match = phaseMatches[index];
    if (!match.index || !match.groups?.phase) {
      continue;
    }

    const nextMatch = phaseMatches[index + 1];
    const phaseBlock = roadmap.slice(match.index, nextMatch?.index ?? roadmap.length);
    const status = extractPhaseStatus(phaseBlock);
    if (!status) {
      addIssue(
        issues,
        "ROADMAP_MISSING_STATUS",
        `Phase ${match.groups.phase} has no status block.`,
        "docs/11_ROADMAP_AND_STATUS.md",
      );
      continue;
    }

    if (!allowedStatuses.has(status)) {
      addIssue(
        issues,
        "ROADMAP_INVALID_STATUS",
        `Phase ${match.groups.phase} has invalid status: ${status}`,
        "docs/11_ROADMAP_AND_STATUS.md",
      );
    }
  }
}

export function validateDocs(root = repoRoot): ValidationResult {
  if (root !== repoRoot) {
    throw new Error("validateDocs currently validates the repository root that contains this script.");
  }

  const issues: ValidationIssue[] = [];
  validateRequiredFiles(issues);

  if (issues.some((issue) => issue.code === "DOC_MISSING")) {
    return { ok: false, issues };
  }

  validateDuplicateNumberedDocs(issues);
  validateRequiredHeadings(issues);
  validateCanonicalTerminology(issues);
  validateInternalFileReferences(issues);
  validateRoadmapPhases(issues);

  return { ok: issues.length === 0, issues };
}

function main(): void {
  const result = validateDocs();
  if (!result.ok) {
    console.error("Documentation validation failed:");
    for (const issue of result.issues) {
      console.error(`- [${issue.code}] ${issue.file ? `${issue.file}: ` : ""}${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Documentation validation passed for ${requiredDocs.length} canonical files.`);
}

if (process.argv[1] && relative(process.argv[1]) === relative(currentFile)) {
  main();
}
