import { adminClient } from "@/lib/supabase/admin";

export async function isAdministrationUser(userId: string) {
  const { data, error } = await adminClient
    .from("user_departments")
    .select("department_id, departments!inner(name)")
    .eq("user_id", userId)
    .eq("departments.name", "Administration")
    .limit(1);

  if (error) {
    return { isAdmin: false, error };
  }

  return { isAdmin: Boolean(data && data.length > 0), error: null };
}
