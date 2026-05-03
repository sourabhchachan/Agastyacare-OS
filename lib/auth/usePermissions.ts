"use client";

import { useEffect, useMemo, useState } from "react";
import { hasPermission, type PermissionCode } from "@/lib/auth/permissions";

export function usePermissions() {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPermissions = async () => {
      const res = await fetch("/api/auth/context", { cache: "no-store" });
      if (!res.ok) {
        setPermissions([]);
        setLoading(false);
        return;
      }
      const data = (await res.json()) as { permissions?: string[] };
      setPermissions(
        data.permissions ?? []
      );
      setLoading(false);
    };

    void loadPermissions();
  }, []);

  const can = useMemo(() => {
    return (permission: PermissionCode) => hasPermission(permissions, permission);
  }, [permissions]);

  return { permissions, loading, can };
}
