import { useParams, useNavigate } from "react-router-dom";

/**
 * Workflow detail / editor page.
 * WorkflowEditor (ReactFlow) component will be wired in Phase 4.
 */
export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full p-4">
      <button
        type="button"
        className="text-sm text-muted-foreground mb-4"
        onClick={() => navigate("/workflow")}
      >
        ← Back to Workflows
      </button>
      {/* WorkflowEditor component will be mounted here in Phase 4 */}
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Workflow {id}
      </div>
    </div>
  );
}
