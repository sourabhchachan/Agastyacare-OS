"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasPermission, type PermissionCode } from "@/lib/auth/permissions";

export function usePermissions() {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    const loadPermissions = async () => {
      const { data, error } = await supabase.rpc("current_user_permissions");
      if (error) {
        setPermissions([]);
        setLoading(false);
        return;
      }
      setPermissions(
        (data ?? []).map((row: { permission_code: string }) => row.permission_code)
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
