import { parseCompoundEditClauses } from "@aevum/agent-planner";
import { describe, expect, it } from "vitest";

describe("parseCompoundEditClauses (Block E, E1)", () => {
  it("splits a compound prompt on commas and 'and' into independently classified clauses", () => {
    const result = parseCompoundEditClauses(
      "make the headline larger, move the product slightly right, change the background to orange and add a thin black border",
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.clauses).toHaveLength(4);
    expect(result.clauses[0]).toMatchObject({ operation: "RESIZE", targetKeyword: "headline", needsToken: false });
    expect(result.clauses[1]).toMatchObject({ operation: "MOVE", targetKeyword: "product", needsToken: false });
    expect(result.clauses[2]).toMatchObject({
      operation: "RECOLOR_FILL",
      targetKeyword: "background",
      needsToken: true,
    });
    // "add a thin black border" names no target of its own — real anaphora resolution happens
    // later, at analyze time, against the real document; this parser only records that fact.
    expect(result.clauses[3]).toMatchObject({ operation: "ADD_BORDER", needsToken: true });
    expect(result.clauses[3]?.targetKeyword).toBeUndefined();
  });

  it("computes a real bigger/smaller resize factor, defaulting to 1.2/0.8 and honoring an explicit percent", () => {
    expect(parseCompoundEditClauses("make the headline bigger").clauses[0]?.params.factor).toBe(1.2);
    expect(parseCompoundEditClauses("make the headline smaller").clauses[0]?.params.factor).toBe(0.8);
    expect(parseCompoundEditClauses("make the headline bigger by 50%").clauses[0]?.params.factor).toBe(1.5);
    expect(parseCompoundEditClauses("make the headline smaller by 30%").clauses[0]?.params.factor).toBe(0.7);
  });

  it("computes a real move direction/distance, defaulting to 20px and honoring slightly/a lot and explicit px", () => {
    const right = parseCompoundEditClauses("move the product right").clauses[0];
    expect(right?.params).toMatchObject({ direction: "right", distance: 20 });
    const slightly = parseCompoundEditClauses("move the product slightly right").clauses[0];
    expect(slightly?.params).toMatchObject({ direction: "right", distance: 12 });
    const far = parseCompoundEditClauses("move the product far left").clauses[0];
    expect(far?.params).toMatchObject({ direction: "left", distance: 80 });
    const exact = parseCompoundEditClauses("move the product left 45px").clauses[0];
    expect(exact?.params).toMatchObject({ direction: "left", distance: 45 });
  });

  it("extracts a real named color or hex value for recolor/border clauses", () => {
    const named = parseCompoundEditClauses("change the background to orange").clauses[0];
    expect(named?.params.color).toEqual({ r: 234, g: 88, b: 12 });
    const hex = parseCompoundEditClauses("change the background to #336699").clauses[0];
    expect(hex?.params.color).toEqual({ r: 0x33, g: 0x66, b: 0x99 });
    const border = parseCompoundEditClauses("add a thin black border").clauses[0];
    expect(border?.params).toMatchObject({ color: { r: 0, g: 0, b: 0 }, width: 1 });
    const thickBlue = parseCompoundEditClauses("add a thick blue border").clauses[0];
    expect(thickBlue?.params).toMatchObject({ color: { r: 37, g: 99, b: 235 }, width: 4 });
  });

  it("recognizes an explicit rename clause and extracts the requested name", () => {
    const clause = parseCompoundEditClauses('rename it to "Launch Title"').clauses[0];
    expect(clause).toMatchObject({ operation: "RENAME", params: { name: "Launch Title" } });
  });

  it("reports a real, specific diagnostic for a clause with no classifiable operation, without dropping the others", () => {
    const result = parseCompoundEditClauses("make the headline bigger, juggle the flamingo");
    expect(result.clauses).toHaveLength(1);
    expect(result.clauses[0]?.operation).toBe("RESIZE");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toContain("juggle the flamingo");
  });

  it("reports a diagnostic for a completely empty/unparseable prompt", () => {
    expect(parseCompoundEditClauses("").diagnostics).toHaveLength(1);
    expect(parseCompoundEditClauses("   ").diagnostics).toHaveLength(1);
  });

  it("reports a diagnostic when the first clause names no target (nothing to continue from)", () => {
    const result = parseCompoundEditClauses("make it bigger");
    expect(result.clauses).toHaveLength(1);
    expect(result.clauses[0]?.targetKeyword).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatch(/does not name a target/);
  });

  it("does not treat 'border'/'stroke'/'outline' as a target noun (anaphora, not a false entity match)", () => {
    const result = parseCompoundEditClauses("change the background to orange and add a black border");
    expect(result.clauses[1]?.targetKeyword).toBeUndefined();
  });
});
