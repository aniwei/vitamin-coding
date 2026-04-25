import { Outlet } from "react-router-dom";
import { AuthGuard } from "../guards/auth-guard";

/**
 * Chat layout – authenticated shell with sidebar + header.
 * AppSidebar / AppHeader components will be wired in Phase 4.
 */
export function ChatLayout() {
  return (
    <AuthGuard>
      <div className="flex flex-col w-full h-screen">
        {/* AppHeader placeholder – replaced during Phase 4 component migration */}
        <div
          id="app-header-slot"
          className="h-12 shrink-0 border-b border-border bg-background"
        />
        <div className="flex flex-1 overflow-hidden">
          {/* AppSidebar placeholder – replaced during Phase 4 component migration */}
          <div
            id="app-sidebar-slot"
            className="w-60 shrink-0 border-r border-border bg-sidebar"
          />
          <main className="relative bg-background flex-1 flex flex-col overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
