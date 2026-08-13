import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface DependencyIssue {
  readonly code: string;
  readonly message: string;
  readonly packageName?: string;
}

export interface DependencyValidationResult {
  readonly ok: boolean;
  readonly issues: DependencyIssue[];
  readonly packageCount: number;
}

interface WorkspacePackage {
  readonly name: string;
  readonly dir: string;
  readonly dependencies: string[];
}

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFile), "..");

const workspaceRoots = ["apps", "packages", "exporters"] as const;

const requiredDirs = [
  "apps/studio",
  "apps/api",
  "apps/mcp-server",
  "apps/render-worker",
  "apps/reconstruction-worker",
  "apps/validation-worker",
  "apps/correction-worker",
  "apps/animation-worker",
  "apps/motion-reconstruction-worker",
  "apps/agent-worker",
  "apps/asset-worker",
  "apps/export-worker",
  "apps/blender-bridge",
  "apps/preview-runtime",
  "packages/document-model",
  "packages/command-engine",
  "packages/project-store",
  "packages/scene-runtime",
  "packages/renderer-2d",
  "packages/renderer-3d",
  "packages/typography",
  "packages/vector-engine",
  "packages/assets",
  "packages/animation",
  "packages/animation-core",
  "packages/motion-reconstruction",
  "packages/multiview-reconstruction",
  "packages/geometry-reconstruction",
  "packages/camera-cinematics",
  "packages/fidelity",
  "packages/rigging",
  "packages/agent-core",
  "packages/agent-context",
  "packages/agent-planner",
  "packages/agent-runtime",
  "packages/reconstruction",
  "packages/responsive-reconstruction",
  "packages/validation",
  "packages/correction",
  "packages/exporters",
  "packages/mcp-protocol",
  "packages/job-system",
  "packages/sandbox",
  "packages/telemetry",
  "packages/test-fixtures",
  "packages/shared",
  "exporters/html-css",
  "exporters/react",
  "exporters/nextjs",
  "exporters/tailwind",
  "exporters/css-modules",
  "exporters/styled-components",
  "exporters/sass",
  "exporters/gsap",
  "exporters/framer-motion",
  "exporters/threejs",
  "exporters/react-three-fiber",
  "exporters/lottie",
  "exporters/rive",
  "exporters/svg",
  "exporters/gltf",
  "exporters/canva",
] as const;

const appNames = new Set([
  "@aevum/studio",
  "@aevum/api",
  "@aevum/mcp-server",
  "@aevum/render-worker",
  "@aevum/reconstruction-worker",
  "@aevum/validation-worker",
  "@aevum/correction-worker",
  "@aevum/animation-worker",
  "@aevum/motion-reconstruction-worker",
  "@aevum/agent-worker",
  "@aevum/asset-worker",
  "@aevum/export-worker",
  "@aevum/blender-bridge",
  "@aevum/preview-runtime",
]);

const exporterNames = new Set([
  "@aevum/exporter-html-css",
  "@aevum/exporter-react",
  "@aevum/exporter-nextjs",
  "@aevum/exporter-tailwind",
  "@aevum/exporter-css-modules",
  "@aevum/exporter-styled-components",
  "@aevum/exporter-sass",
  "@aevum/exporter-gsap",
  "@aevum/exporter-framer-motion",
  "@aevum/exporter-threejs",
  "@aevum/exporter-react-three-fiber",
  "@aevum/exporter-lottie",
  "@aevum/exporter-rive",
  "@aevum/exporter-svg",
  "@aevum/exporter-gltf",
  "@aevum/exporter-canva",
]);

const forbiddenDependencies: Record<string, readonly string[]> = {
  "@aevum/shared": ["@aevum/"],
  "@aevum/document-model": [
    "@aevum/command-engine",
    "@aevum/project-store",
    "@aevum/scene-runtime",
    "@aevum/renderer-2d",
    "@aevum/renderer-3d",
    "@aevum/exporters",
    "@aevum/mcp-protocol",
    "@aevum/studio",
    "@aevum/mcp-server",
  ],
  "@aevum/command-engine": [
    "@aevum/studio",
    "@aevum/renderer-2d",
    "@aevum/renderer-3d",
    "@aevum/exporters",
    "@aevum/mcp-server",
  ],
  "@aevum/renderer-2d": ["@aevum/exporters"],
  "@aevum/renderer-3d": ["@aevum/exporters"],
  "@aevum/mcp-protocol": ["@aevum/studio", "@aevum/api", "@aevum/mcp-server"],
  "@aevum/validation": ["@aevum/command-engine", "@aevum/project-store", "@aevum/studio", "@aevum/mcp-server"],
  "@aevum/correction": [
    "@aevum/project-store",
    "@aevum/reconstruction",
    "@aevum/renderer-2d",
    "@aevum/scene-runtime",
    "@aevum/studio",
    "@aevum/mcp-server",
  ],
  "@aevum/responsive-reconstruction": [
    "@aevum/project-store",
    "@aevum/reconstruction",
    "@aevum/correction",
    "@aevum/studio",
    "@aevum/mcp-server",
  ],
  "@aevum/animation-core": [
    "@aevum/command-engine",
    "@aevum/project-store",
    "@aevum/scene-runtime",
    "@aevum/renderer-2d",
    "@aevum/studio",
    "@aevum/mcp-server",
  ],
  "@aevum/motion-reconstruction": [
    "@aevum/project-store",
    "@aevum/scene-runtime",
    "@aevum/renderer-2d",
    "@aevum/studio",
    "@aevum/mcp-server",
  ],
  "@aevum/multiview-reconstruction": [
    "@aevum/command-engine",
    "@aevum/project-store",
    "@aevum/scene-runtime",
    "@aevum/renderer-2d",
    "@aevum/renderer-3d",
    "@aevum/studio",
    "@aevum/mcp-server",
    "@aevum/blender-bridge",
  ],
  "@aevum/camera-cinematics": [
    "@aevum/command-engine",
    "@aevum/project-store",
    "@aevum/scene-runtime",
    "@aevum/renderer-2d",
    "@aevum/renderer-3d",
    "@aevum/studio",
    "@aevum/mcp-server",
    "@aevum/blender-bridge",
  ],
  "@aevum/fidelity": [
    "@aevum/command-engine",
    "@aevum/project-store",
    "@aevum/studio",
    "@aevum/mcp-server",
    "@aevum/blender-bridge",
  ],
  "@aevum/geometry-reconstruction": [
    "@aevum/project-store",
    "@aevum/scene-runtime",
    "@aevum/renderer-2d",
    "@aevum/studio",
    "@aevum/mcp-server",
    "@aevum/blender-bridge",
  ],
  "@aevum/rigging": [
    "@aevum/project-store",
    "@aevum/scene-runtime",
    "@aevum/renderer-2d",
    "@aevum/renderer-3d",
    "@aevum/studio",
    "@aevum/mcp-server",
    "@aevum/blender-bridge",
  ],
  "@aevum/agent-core": [
    "@aevum/agent-context",
    "@aevum/agent-planner",
    "@aevum/agent-runtime",
    "@aevum/agent-worker",
    "@aevum/mcp-server",
    "@aevum/project-store",
    "@aevum/command-engine",
  ],
  "@aevum/agent-context": [
    "@aevum/agent-planner",
    "@aevum/agent-runtime",
    "@aevum/agent-worker",
    "@aevum/mcp-server",
    "@aevum/project-store",
    "@aevum/command-engine",
  ],
  "@aevum/agent-planner": [
    "@aevum/agent-runtime",
    "@aevum/agent-worker",
    "@aevum/mcp-server",
    "@aevum/project-store",
    "@aevum/command-engine",
  ],
  "@aevum/agent-runtime": ["@aevum/agent-worker", "@aevum/mcp-server", "@aevum/project-store", "@aevum/command-engine"],
};

function readPackageJson(filePath: string): {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} {
  return JSON.parse(readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")) as {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

function discoverPackages(root = repoRoot): WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];

  for (const workspaceRoot of workspaceRoots) {
    const absoluteRoot = path.join(root, workspaceRoot);
    if (!existsSync(absoluteRoot)) {
      continue;
    }

    for (const entry of readdirSync(absoluteRoot)) {
      const dir = path.join(absoluteRoot, entry);
      if (!statSync(dir).isDirectory()) {
        continue;
      }

      const packageJsonPath = path.join(dir, "package.json");
      if (!existsSync(packageJsonPath)) {
        continue;
      }

      const packageJson = readPackageJson(packageJsonPath);
      if (!packageJson.name) {
        continue;
      }

      packages.push({
        name: packageJson.name,
        dir: path.relative(root, dir).replaceAll("\\", "/"),
        dependencies: Object.keys(packageJson.dependencies ?? {}).filter((dependency) =>
          dependency.startsWith("@aevum/"),
        ),
      });
    }
  }

  return packages;
}

function addIssue(issues: DependencyIssue[], code: string, message: string, packageName?: string): void {
  issues.push({ code, message, packageName });
}

function validateRequiredStructure(root: string, issues: DependencyIssue[]): void {
  for (const dir of requiredDirs) {
    const absoluteDir = path.join(root, dir);
    if (!existsSync(absoluteDir)) {
      addIssue(issues, "WORKSPACE_DIR_MISSING", `Missing required workspace directory: ${dir}`);
      continue;
    }

    for (const fileName of ["README.md", "package.json", "src/index.ts"]) {
      const requiredPath = path.join(absoluteDir, fileName);
      if (!existsSync(requiredPath)) {
        addIssue(issues, "WORKSPACE_CONTRACT_MISSING", `Missing ${fileName} in ${dir}`);
      }
    }
  }
}

function validateDuplicatePackageNames(packages: WorkspacePackage[], issues: DependencyIssue[]): void {
  const seen = new Map<string, string[]>();
  for (const packageInfo of packages) {
    seen.set(packageInfo.name, [...(seen.get(packageInfo.name) ?? []), packageInfo.dir]);
  }

  for (const [name, dirs] of seen.entries()) {
    if (dirs.length > 1) {
      addIssue(issues, "DUPLICATE_PACKAGE_NAME", `Duplicate package name ${name}: ${dirs.join(", ")}`, name);
    }
  }
}

function validateExplicitBoundaries(packages: WorkspacePackage[], issues: DependencyIssue[]): void {
  const packageNames = new Set(packages.map((packageInfo) => packageInfo.name));

  for (const packageInfo of packages) {
    for (const dependency of packageInfo.dependencies) {
      if (!packageNames.has(dependency)) {
        addIssue(
          issues,
          "UNKNOWN_WORKSPACE_DEPENDENCY",
          `Unknown workspace dependency: ${dependency}`,
          packageInfo.name,
        );
      }

      if (appNames.has(dependency) && !appNames.has(packageInfo.name)) {
        addIssue(
          issues,
          "PACKAGE_DEPENDS_ON_APP",
          `Non-app package must not depend on app package ${dependency}.`,
          packageInfo.name,
        );
      }

      if (exporterNames.has(dependency) && !exporterNames.has(packageInfo.name)) {
        addIssue(
          issues,
          "PACKAGE_DEPENDS_ON_TARGET_EXPORTER",
          `Packages must not depend on target exporter ${dependency}.`,
          packageInfo.name,
        );
      }
    }

    for (const forbidden of forbiddenDependencies[packageInfo.name] ?? []) {
      for (const dependency of packageInfo.dependencies) {
        const violates = forbidden.endsWith("/") ? dependency.startsWith(forbidden) : dependency === forbidden;
        if (violates) {
          addIssue(
            issues,
            "FORBIDDEN_DEPENDENCY",
            `${packageInfo.name} must not depend on ${dependency}.`,
            packageInfo.name,
          );
        }
      }
    }
  }
}

function validateNoCycles(packages: WorkspacePackage[], issues: DependencyIssue[]): void {
  const byName = new Map(packages.map((packageInfo) => [packageInfo.name, packageInfo]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (name: string, stack: string[]): void => {
    if (visiting.has(name)) {
      const cycleStart = stack.indexOf(name);
      const cycle = [...stack.slice(cycleStart), name].join(" -> ");
      addIssue(issues, "CIRCULAR_DEPENDENCY", `Circular workspace dependency detected: ${cycle}`, name);
      return;
    }

    if (visited.has(name)) {
      return;
    }

    visiting.add(name);
    const packageInfo = byName.get(name);
    for (const dependency of packageInfo?.dependencies ?? []) {
      if (byName.has(dependency)) {
        visit(dependency, [...stack, dependency]);
      }
    }
    visiting.delete(name);
    visited.add(name);
  };

  for (const packageInfo of packages) {
    visit(packageInfo.name, [packageInfo.name]);
  }
}

export function validateDependencyBoundaries(root = repoRoot): DependencyValidationResult {
  const issues: DependencyIssue[] = [];
  validateRequiredStructure(root, issues);

  const packages = discoverPackages(root);
  validateDuplicatePackageNames(packages, issues);
  validateExplicitBoundaries(packages, issues);
  validateNoCycles(packages, issues);

  return {
    ok: issues.length === 0,
    issues,
    packageCount: packages.length,
  };
}

function main(): void {
  const result = validateDependencyBoundaries();
  if (!result.ok) {
    console.error("Dependency-boundary validation failed:");
    for (const issue of result.issues) {
      console.error(`- [${issue.code}] ${issue.packageName ? `${issue.packageName}: ` : ""}${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Dependency-boundary validation passed for ${result.packageCount} workspace packages.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main();
}
