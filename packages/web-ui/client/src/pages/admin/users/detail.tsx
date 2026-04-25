import { useParams, useNavigate } from "react-router-dom";

/**
 * Admin user detail page.
 * AdminUserDetail component will be wired in Phase 4.
 */
export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full p-4">
      <button
        type="button"
        className="text-sm text-muted-foreground mb-4"
        onClick={() => navigate("/admin/users")}
      >
        ← Back to Users
      </button>
      {/* AdminUserDetail component will be mounted here in Phase 4 */}
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Admin – User {id}
      </div>
    </div>
  );
}
