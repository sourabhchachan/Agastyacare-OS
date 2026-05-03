import type { SupabaseClient } from "@supabase/supabase-js";

/** 10-digit numeric string, unique against `staff_users.staff_id`. */
export async function allocateUniqueStaffId(admin: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 5000; attempt++) {
    const n = (Date.now() + attempt) % 10_000_000_000;
    const candidate = String(n).padStart(10, "0");
    const { data } = await admin.from("staff_users").select("id").eq("staff_id", candidate).maybeSingle();
    if (!data) return candidate;
  }
  throw new Error("Could not allocate a unique staff ID");
}
