"use client";

import { usePermissions } from "@/lib/auth/usePermissions";
import { type PermissionCode } from "@/lib/auth/permissions";

type CanDoProps = {
  permission: PermissionCode;
  fallback?: React.ReactNode;
  children: React.ReactNode;
};

export function CanDo({ permission, fallback = null, children }: CanDoProps) {
  const { loading, can } = usePermissions();

  if (loading) {
    return null;
  }

  if (!can(permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
