import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";

/**
 * Archive detail page.
 * MCPDashboard / ArchiveViewer components will be wired in Phase 4.
 */
export default function ArchiveDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) {
      navigate("/", { replace: true });
    }
  }, [id, navigate]);

  if (!id) return null;

  return (
    <div className="flex flex-col h-full p-4" data-archive-id={id}>
      {/* ArchiveViewer component will be mounted here in Phase 4 */}
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Loading archive {id}…
      </div>
    </div>
  );
}
