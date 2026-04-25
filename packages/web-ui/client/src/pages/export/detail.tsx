import { useParams } from "react-router-dom";

/**
 * Export share page (public, no auth required).
 * ExportViewer component will be wired in Phase 4.
 */
export default function ExportDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      {/* ExportViewer component will be mounted here in Phase 4 */}
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-center text-muted-foreground text-sm py-12">
          Loading export {id}…
        </div>
      </div>
    </div>
  );
}
