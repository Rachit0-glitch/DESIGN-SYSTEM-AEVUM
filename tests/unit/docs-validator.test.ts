import { describe, expect, it } from "vitest";
import { validateDocs } from "../../scripts/validate-docs.js";

describe("documentation validator", () => {
  it("accepts the canonical documentation set and roadmap structure", () => {
    const result = validateDocs();

    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
