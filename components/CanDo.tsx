"use client";

import { usePermissions } from "@/lib/auth/usePermissions";
import { type PermissionCode } from "@/lib/auth/permissions";

type CanDoProps = {
  /** Single permission (omit if using `anyOf`). */
  permission?: PermissionCode;
  /** User may access if they have any of these permissions. */
  anyOf?: PermissionCode[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
};

export function CanDo({ permission, anyOf, fallback = null, children }: CanDoProps) {
  const { loading, can } = usePermissions();

  if (loading) {
    return null;
  }

  const allowed = anyOf?.length
    ? anyOf.some((p) => can(p))
    : permission
      ? can(permission)
      : false;

  if (!allowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
