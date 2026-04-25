import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";

function useIsAuthenticated() {
  return true;
}

export function AuthGuard({ children }: PropsWithChildren) {
  const location = useLocation();
  const authenticated = useIsAuthenticated();

  if (!authenticated) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
