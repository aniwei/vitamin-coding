import { useParams, useNavigate } from "react-router-dom";

/**
 * Edit MCP server page.
 * MCP edit form component will be wired in Phase 4.
 */
export default function McpEditPage() {
  const { id } = useParams<{ id: string }>();
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
      {/* MCPEditForm component will be mounted here in Phase 4 */}
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Edit MCP Server {id}
      </div>
    </div>
  );
}
