import { Outlet } from "react-router-dom";

/**
 * Auth layout – unauthenticated shell for sign-in / sign-up pages.
 */
export function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Outlet />
    </div>
  );
}
