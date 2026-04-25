import type { PropsWithChildren } from "react";

type PermissionGuardProps = PropsWithChildren<{
  permission: string;
}>;

function useHasPermission(_permission: string) {
  return true;
}

export function PermissionGuard({ children, permission }: PermissionGuardProps) {
  const hasPermission = useHasPermission(permission);

  if (!hasPermission) {
    return <div>Forbidden</div>;
  }

  return <>{children}</>;
}
