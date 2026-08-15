import { describe, expect, it } from "vitest";
import {
  createMcpConnectionProvider,
  createSingleMcpConnectionProvider,
} from "../../apps/studio/src/core/mcp-connections.js";

describe("MCP connection provider (Block D9)", () => {
  it("resolves the default connection when no id is requested", () => {
    const provider = createMcpConnectionProvider([
      { id: "primary", endpoint: "https://mcp.example.test", label: "Primary" },
    ]);
    expect(provider.resolve()).toEqual({ id: "primary", endpoint: "https://mcp.example.test", label: "Primary" });
    expect(provider.connections).toHaveLength(1);
  });

  it("selects among multiple real connections by id (Block D9: real connection selection)", () => {
    const provider = createMcpConnectionProvider(
      [
        { id: "primary", endpoint: "https://mcp-a.example.test", label: "Primary" },
        { id: "secondary", endpoint: "https://mcp-b.example.test", label: "Secondary" },
      ],
      "primary",
    );
    expect(provider.resolve("secondary").endpoint).toBe("https://mcp-b.example.test");
    expect(provider.resolve().endpoint).toBe("https://mcp-a.example.test");
    expect(provider.resolve("primary").endpoint).toBe("https://mcp-a.example.test");
  });

  it("fails loudly when the requested connection id is not configured (Block D9: real connection failure)", () => {
    const provider = createMcpConnectionProvider([
      { id: "primary", endpoint: "https://mcp.example.test", label: "Primary" },
    ]);
    expect(() => provider.resolve("does-not-exist")).toThrow(/MCP connection "does-not-exist" is not configured/);
  });

  it("refuses to construct a provider with no connections at all", () => {
    expect(() => createMcpConnectionProvider([])).toThrow(/at least one configured connection/i);
  });

  it("refuses to construct a provider with duplicate connection ids", () => {
    expect(() =>
      createMcpConnectionProvider([
        { id: "primary", endpoint: "https://mcp-a.example.test", label: "A" },
        { id: "primary", endpoint: "https://mcp-b.example.test", label: "B" },
      ]),
    ).toThrow(/registered more than once/);
  });

  it("refuses to construct a provider whose declared default connection id isn't among its connections", () => {
    expect(() =>
      createMcpConnectionProvider(
        [{ id: "primary", endpoint: "https://mcp.example.test", label: "Primary" }],
        "does-not-exist",
      ),
    ).toThrow(/Default MCP connection "does-not-exist" is not among the configured connections/);
  });

  it("wraps a single production endpoint in the same real provider shape (preserves current single-MCP behavior)", () => {
    const provider = createSingleMcpConnectionProvider("https://mcp.production.test");
    expect(provider.connections).toEqual([
      { id: "default", endpoint: "https://mcp.production.test", label: "Production MCP" },
    ]);
    expect(provider.resolve().endpoint).toBe("https://mcp.production.test");
    expect(provider.resolve("default").endpoint).toBe("https://mcp.production.test");
  });
});
