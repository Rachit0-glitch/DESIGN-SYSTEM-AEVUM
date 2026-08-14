# EXTERNAL MCP CONNECTION HANDOFF

## Production Connection

- Server name: `AEVUM Design System`
- Service root: `https://mcp-server-production-209e.up.railway.app`
- Endpoint: `POST /mcp`
- Transport: stateless Streamable HTTP (MCP JSON-RPC); the existing internal AEVUM envelope remains supported at
  the same route.
- Authentication: `Authorization: Bearer <Supabase access token>`
- Scope: the endpoint URL must include `workspaceId`, `projectId`, and `documentId` query parameters.

Sign in to [AEVUM Studio](https://design-system-aevum-peach.vercel.app). The production session menu has separate
buttons to copy the access credential, workspace ID, project ID, and document ID. The credential is the signed,
short-lived access token for that user, not a service-role key. Re-copy it after the Supabase session expires. Never
commit it or put it in a shared project configuration.

The scoped endpoint therefore has this shape:

```text
https://mcp-server-production-209e.up.railway.app/mcp?workspaceId=VALUE_COPIED_FROM_STUDIO&projectId=VALUE_COPIED_FROM_STUDIO&documentId=VALUE_COPIED_FROM_STUDIO
```

Those three IDs are identifiers, not credentials. The server still denies any ID outside the authenticated user's
membership.

## Codex

Current Codex clients share `~/.codex/config.toml` and support Streamable HTTP plus bearer tokens sourced from an
environment variable. This configuration follows the [official Codex MCP documentation](https://developers.openai.com/codex/mcp/):

```toml
[mcp_servers.aevum]
url = "https://mcp-server-production-209e.up.railway.app/mcp?workspaceId=VALUE_COPIED_FROM_STUDIO&projectId=VALUE_COPIED_FROM_STUDIO&documentId=VALUE_COPIED_FROM_STUDIO"
bearer_token_env_var = "AEVUM_MCP_ACCESS_TOKEN"
required = true
default_tools_approval_mode = "writes"
tool_timeout_sec = 60
```

Set `AEVUM_MCP_ACCESS_TOKEN` in the environment that launches Codex to the credential copied from Studio, restart
Codex, and inspect `/mcp` or run `codex mcp list`. This keeps the token out of `config.toml`.

## Google Antigravity

Antigravity IDE supports remote MCP servers and its shared raw configuration is
`~/.gemini/config/mcp_config.json`, as shown in [Google's Antigravity IDE guide](https://codelabs.developers.google.com/getting-started-agy-ide#10).
The current documented custom-server format accepts `serverUrl` and request `headers`:

```json
{
  "mcpServers": {
    "aevum": {
      "serverUrl": "https://mcp-server-production-209e.up.railway.app/mcp?workspaceId=VALUE_COPIED_FROM_STUDIO&projectId=VALUE_COPIED_FROM_STUDIO&documentId=VALUE_COPIED_FROM_STUDIO",
      "headers": {
        "Authorization": "Bearer VALUE_COPIED_WITH_COPY_MCP_CREDENTIAL"
      }
    }
  }
}
```

Restrict this local file to the current user because Antigravity's documented header form stores the short-lived
credential in the file. In Antigravity IDE, open **MCP Servers**, choose **Manage MCP Servers**, use **View raw
config**, save the entry, and refresh the installed servers. Antigravity CLI uses `/mcp` to inspect status; its
workspace-local alternative is `.agents/mcp_config.json`, which must not be committed when it contains the header.

## Permissions

- `VIEWER`: project/document/asset/timeline/3D/lighting/camera/Blender/validation/fidelity reads.
- `EDITOR`: adds canonical document, asset, timeline, 3D, lighting, camera, Blender, and fidelity writes and exports.
- `AGENT`: bounded canonical and domain writes but no project administration or destructive Blender permission.
- `OWNER` / `ADMIN`: all current permissions, including destructive Blender tools and audit reads.

Blender-backed tools appear disabled in production while the private/local Blender Bridge is unavailable. Standard
2D, animation metadata, camera, lighting, rigging, and fidelity capabilities remain permission-filtered by tool.
Use the least-privileged role that covers the intended work.

## Connection Tests

Read-only:

> Use AEVUM MCP to inspect the current design document. Do not modify anything.

Safe mutation:

> Using AEVUM MCP, change the selected test element through a dry-run first, apply it only if valid with a unique
> idempotency key and the current document version, and verify the resulting document.

## Troubleshooting

- Unreachable: check the Railway `/health`, `/ready`, and `/version` routes and the full `/mcp?...` URL.
- `401`: copy a fresh MCP credential from an active Studio session; do not use an anon or service-role key.
- `403`: the signed-in user lacks the workspace membership or required role permission.
- Workspace mismatch or not found: re-copy all three IDs from the same open Studio project.
- Version conflict: re-read `document.get`, rebuild the dry run against the current version, then use a new
  idempotency key.
- Insufficient permissions: ask a workspace owner for the minimum suitable role; do not broaden the server token.
- Stale tools: restart/refresh the MCP client after checking `/version`.
- Server version mismatch: do not write until Railway `/version` matches the documented Phase 24 deployment.

## User Steps

1. Sign in to AEVUM Studio and open the project.
2. Copy the MCP credential, workspace ID, project ID, and document ID from the session menu.
3. Add the scoped production URL to Codex or Antigravity using the configuration above.
4. Put the credential in `AEVUM_MCP_ACCESS_TOKEN` for Codex, or Antigravity's local authorization header field.
5. Restart or refresh the client and inspect its MCP server list.
6. Run the read-only test prompt.
7. Run the dry-run-first mutation test on a disposable element.
8. Re-copy the credential when the Studio session expires.
