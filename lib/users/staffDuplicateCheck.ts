import type { SupabaseClient } from "@supabase/supabase-js";

/** True if another user with the same full name (trimmed, case-insensitive) exists in any of `departmentIds`. */
export async function hasDuplicateStaffInDepartments(
  admin: SupabaseClient,
  fullName: string,
  departmentIds: string[]
): Promise<boolean> {
  const trimmed = fullName.trim();
  if (!trimmed || departmentIds.length === 0) return false;

  const { data: udRows, error: udErr } = await admin
    .from("user_departments")
    .select("user_id")
    .in("department_id", departmentIds);
  if (udErr || !udRows?.length) return false;

  const userIds = Array.from(new Set(udRows.map((r) => r.user_id)));
  const { data: staffRows, error: suErr } = await admin
    .from("staff_users")
    .select("id, full_name")
    .in("id", userIds)
    .eq("is_active", true);
  if (suErr || !staffRows?.length) return false;

  const target = trimmed.toLowerCase();
  return staffRows.some((s) => s.full_name.trim().toLowerCase() === target);
}
