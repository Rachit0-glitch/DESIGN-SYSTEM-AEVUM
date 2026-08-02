import { describe, expect, it } from "vitest";
import { validateDependencyBoundaries } from "../../scripts/validate-dependencies.js";

describe("dependency boundary validator", () => {
  it("accepts the Phase 0 workspace package graph", () => {
    const result = validateDependencyBoundaries();

    expect(result.packageCount).toBe(50);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
