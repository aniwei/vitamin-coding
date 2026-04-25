import { createBrowserRouter } from "react-router-dom";
import { lazy, Suspense } from "react";
import { NotFoundPage } from "./not-found";
import { ChatLayout } from "./layouts/chat-layout";
import { AuthLayout } from "./layouts/auth-layout";
import { AdminLayout } from "./layouts/admin-layout";
import { PublicLayout } from "./layouts/public-layout";
import { HealthPage } from "../pages/health";

// Lazy-load all pages for code splitting
const ChatIndexPage = lazy(() => import("../pages/chat/index"));
const ChatThreadPage = lazy(() => import("../pages/chat/thread"));
const ArchiveDetailPage = lazy(() => import("../pages/archive/detail"));
const McpIndexPage = lazy(() => import("../pages/mcp/index"));
const McpCreatePage = lazy(() => import("../pages/mcp/create"));
const McpEditPage = lazy(() => import("../pages/mcp/edit"));
const McpTestPage = lazy(() => import("../pages/mcp/test"));
const WorkflowIndexPage = lazy(() => import("../pages/workflow/index"));
const WorkflowDetailPage = lazy(() => import("../pages/workflow/detail"));
const SignInPage = lazy(() => import("../pages/auth/sign-in"));
const SignUpPage = lazy(() => import("../pages/auth/sign-up"));
const SignUpEmailPage = lazy(() => import("../pages/auth/sign-up-email"));
const ExportDetailPage = lazy(() => import("../pages/export/detail"));
const AdminUsersIndexPage = lazy(() => import("../pages/admin/users/index"));
const AdminUserDetailPage = lazy(() => import("../pages/admin/users/detail"));

function PageFallback() {
  return (
    <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
      Loading…
    </div>
  );
}

function withSuspense(element: React.ReactNode) {
  return <Suspense fallback={<PageFallback />}>{element}</Suspense>;
}

export const router = createBrowserRouter([
  // ── Auth routes (unauthenticated) ─────────────────────────────────────────
  {
    element: <AuthLayout />,
    children: [
      { path: "/sign-in", element: withSuspense(<SignInPage />) },
      { path: "/sign-up", element: withSuspense(<SignUpPage />) },
      { path: "/sign-up/email", element: withSuspense(<SignUpEmailPage />) },
    ],
  },

  // ── Public routes (no auth required) ─────────────────────────────────────
  {
    element: <PublicLayout />,
    children: [
      { path: "/export/:id", element: withSuspense(<ExportDetailPage />) },
    ],
  },

  // ── Chat routes (authenticated) ───────────────────────────────────────────
  {
    element: <ChatLayout />,
    children: [
      { path: "/", element: withSuspense(<ChatIndexPage />) },
      { path: "/chat/:thread", element: withSuspense(<ChatThreadPage />) },
      { path: "/archive/:id", element: withSuspense(<ArchiveDetailPage />) },
      { path: "/mcp", element: withSuspense(<McpIndexPage />) },
      { path: "/mcp/create", element: withSuspense(<McpCreatePage />) },
      { path: "/mcp/:id/edit", element: withSuspense(<McpEditPage />) },
      { path: "/mcp/:id/test", element: withSuspense(<McpTestPage />) },
      { path: "/workflow", element: withSuspense(<WorkflowIndexPage />) },
      { path: "/workflow/:id", element: withSuspense(<WorkflowDetailPage />) },

      // ── Admin routes (permission guarded) ──────────────────────────────────
      {
        element: <AdminLayout />,
        children: [
          {
            path: "/admin/users",
            element: withSuspense(<AdminUsersIndexPage />),
          },
          {
            path: "/admin/users/:id",
            element: withSuspense(<AdminUserDetailPage />),
          },
        ],
      },
    ],
  },

  // ── Dev / diagnostic ──────────────────────────────────────────────────────
  { path: "/health", element: <HealthPage /> },

  // ── 404 ───────────────────────────────────────────────────────────────────
  { path: "*", element: <NotFoundPage /> },
]);

