import { Outlet } from "react-router-dom";
import { PermissionGuard } from "../guards/permission-guard";

/**
 * Admin layout – requires admin permission.
 */
export function AdminLayout() {
  return (
    <PermissionGuard permission="admin">
      <Outlet />
    </PermissionGuard>
  );
}
