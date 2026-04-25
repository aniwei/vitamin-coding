import { useNavigate } from "react-router-dom";

/**
 * Create MCP server page.
 * MCP create form component will be wired in Phase 4.
 */
export default function McpCreatePage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full p-4">
      <button
        type="button"
        className="text-sm text-muted-foreground mb-4"
        onClick={() => navigate("/mcp")}
      >
        ← Back to MCP
      </button>
      {/* MCPCreateForm component will be mounted here in Phase 4 */}
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Create MCP Server
      </div>
    </div>
  );
}
