import { Outlet } from "react-router-dom";

/**
 * Public layout – no auth required (e.g. export share pages).
 */
export function PublicLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Outlet />
    </div>
  );
}
