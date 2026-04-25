import { Hono } from "hono";
import { authMiddleware } from "../middlewares/auth.js";

const mcp = new Hono();

mcp.use("*", authMiddleware);

/**
 * GET /api/mcp/list
 * List all MCP servers for the authenticated user.
 * TODO(Phase 4): wire to mcpRepository + mcpClientsManager.
 */
mcp.get("/list", async (c) => {
  return c.json({ success: true, data: [] });
});

/**
 * GET /api/mcp/server-customizations/:server
 * Get customizations for a specific MCP server.
 * TODO(Phase 4): wire to mcpRepository.getServerCustomizations.
 */
mcp.get("/server-customizations/:server", async (c) => {
  const server = c.req.param("server");
  return c.json({ success: true, data: { server, customizations: {} } });
});

/**
 * PUT /api/mcp/server-customizations/:server
 * Update customizations for a specific MCP server.
 * TODO(Phase 4): wire to mcpRepository.updateServerCustomizations.
 */
mcp.put("/server-customizations/:server", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Server customizations not yet wired" },
    },
    501,
  );
});

/**
 * GET /api/mcp/tool-customizations/:server/:tool
 * Get customizations for a specific tool on a server.
 * TODO(Phase 4): wire to mcpRepository.getToolCustomizations.
 */
mcp.get("/tool-customizations/:server/:tool", async (c) => {
  const server = c.req.param("server");
  const tool = c.req.param("tool");
  return c.json({ success: true, data: { server, tool, customizations: {} } });
});

/**
 * PUT /api/mcp/tool-customizations/:server/:tool
 * Update customizations for a specific tool.
 * TODO(Phase 4): wire to mcpRepository.updateToolCustomizations.
 */
mcp.put("/tool-customizations/:server/:tool", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Tool customizations not yet wired" },
    },
    501,
  );
});

/**
 * POST /api/mcp
 * Create a new MCP server connection.
 * TODO(Phase 4): wire to saveMcpClientAction + permission check.
 */
mcp.post("/", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "MCP server creation not yet wired" },
    },
    501,
  );
});

/**
 * PUT /api/mcp/:id
 * Update an existing MCP server.
 * TODO(Phase 4): wire to mcpRepository.updateServer.
 */
mcp.put("/:id", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "MCP server update not yet wired" },
    },
    501,
  );
});

/**
 * DELETE /api/mcp/:id
 * Delete an MCP server.
 * TODO(Phase 4): wire to removeMcpClientAction + permission check.
 */
mcp.delete("/:id", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "MCP server deletion not yet wired" },
    },
    501,
  );
});

/**
 * GET /api/mcp/:id
 * Get a single MCP server.
 * TODO(Phase 4): wire to mcpRepository.selectById.
 */
mcp.get("/:id", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "MCP server fetch not yet wired" },
    },
    501,
  );
});

/**
 * GET /api/mcp/oauth/callback
 * OAuth callback for MCP server OAuth flow.
 * Server-side only – no client API call.
 * TODO(Phase 4): wire to mcpOAuthRepository + mcpClientsManager.
 */
mcp.get("/oauth/callback", async (c) => {
  return c.html(
    `<!DOCTYPE html><html><body>
    <script>
      window.opener?.postMessage({ type: 'mcp-oauth-error', error: 'not_implemented' }, window.location.origin);
      setTimeout(() => window.close(), 1000);
    </script>
    <p>OAuth callback not yet wired.</p>
    </body></html>`,
    501,
  );
});

export { mcp as mcpRouter };
