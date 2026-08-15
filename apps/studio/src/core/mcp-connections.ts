/**
 * A real provider/connection abstraction for Studio's MCP transport (Block D9), replacing the
 * previous model where `production.ts` built an `AgentMcpClient` directly from one hardcoded
 * `configuration.mcpUrl` string wherever it needed one. Today exactly one connection is ever
 * configured (`readStudioBrowserConfiguration()` still reads a single `VITE_AEVUM_MCP_URL`), so
 * runtime behavior is unchanged — every call still resolves to that same endpoint. What changes is
 * that "which connection to use" is now a real, selectable, testable operation instead of a string
 * baked into every call site, so a second connection (a different deployment, a per-workspace MCP
 * server, a local/offline fallback) can be registered later without threading a new parameter
 * through every caller.
 */
export interface McpConnectionDescriptor {
  readonly id: string;
  readonly endpoint: string;
  readonly label: string;
}

export interface McpConnectionProvider {
  /** Every connection this provider knows about, in registration order. */
  readonly connections: readonly McpConnectionDescriptor[];
  /**
   * Resolves a connection by id, or the provider's default connection when `connectionId` is
   * omitted. Throws a real, descriptive error — never a silent fallback — when the requested id
   * isn't configured, so a caller asking for a connection that doesn't exist fails loudly at the
   * point of the request rather than quietly talking to the wrong server.
   */
  resolve(connectionId?: string): McpConnectionDescriptor;
}

export function createMcpConnectionProvider(
  connections: readonly McpConnectionDescriptor[],
  defaultConnectionId?: string,
): McpConnectionProvider {
  if (connections.length === 0) {
    throw new Error("An MCP connection provider needs at least one configured connection.");
  }
  const ids = connections.map((connection) => connection.id);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) {
    throw new Error(`MCP connection id "${duplicate}" is registered more than once.`);
  }
  const byId = new Map(connections.map((connection) => [connection.id, connection]));
  const fallbackId = defaultConnectionId ?? connections[0]?.id;
  if (fallbackId === undefined || !byId.has(fallbackId)) {
    throw new Error(
      `Default MCP connection "${fallbackId}" is not among the configured connections: ${ids.join(", ")}.`,
    );
  }
  return Object.freeze({
    connections: [...connections],
    resolve(connectionId?: string): McpConnectionDescriptor {
      const id = connectionId ?? fallbackId;
      const connection = byId.get(id);
      if (!connection) {
        throw new Error(`MCP connection "${id}" is not configured. Available connections: ${ids.join(", ")}.`);
      }
      return connection;
    },
  });
}

/** The current, single-connection production configuration, wrapped in the real provider shape. */
export function createSingleMcpConnectionProvider(endpoint: string): McpConnectionProvider {
  return createMcpConnectionProvider([{ id: "default", endpoint, label: "Production MCP" }]);
}
