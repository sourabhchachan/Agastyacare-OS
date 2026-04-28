import type { SupabaseClient } from "@supabase/supabase-js";

export function parseBedIndex(bedNumber: string): number | null {
  const m = bedNumber.match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return Number.isNaN(n) ? null : n;
}

/** Resolve assigned staff for a bed in a department using bed range rows. */
export async function findUserIdForBedInDepartment(
  admin: SupabaseClient,
  deptId: string,
  bedNumber: string
): Promise<string | null> {
  const n = parseBedIndex(bedNumber);
  if (n === null) return null;
  const { data } = await admin
    .from("bed_assignments")
    .select("assigned_user_id, bed_range_start, bed_range_end")
    .eq("dept_id", deptId);
  for (const row of data ?? []) {
    const a = parseInt(String(row.bed_range_start), 10);
    const b = parseInt(String(row.bed_range_end), 10);
    if (!Number.isNaN(a) && !Number.isNaN(b) && n >= a && n <= b) {
      return row.assigned_user_id;
    }
  }
  return null;
}

export async function findFirstActiveUserInDepartment(
  admin: SupabaseClient,
  deptId: string
): Promise<string | null> {
  const { data: rows } = await admin
    .from("user_departments")
    .select("user_id, staff_users(is_active)")
    .eq("department_id", deptId);
  for (const row of rows ?? []) {
    const raw = row.staff_users as
      | { is_active: boolean }
      | { is_active: boolean }[]
      | null
      | undefined;
    const su = Array.isArray(raw) ? raw[0] : raw;
    if (su?.is_active) return (row as { user_id: string }).user_id;
  }
  return null;
}
