import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";

export async function GET() {
  const auth = await requirePermission("raise_items");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data: patients }, { data: catalogueItems }] = await Promise.all([
    adminClient
      .from("patients")
      .select("id, name, patient_number, bed_number")
      .eq("is_active", true)
      .order("name"),
    adminClient
      .from("item_catalogue")
      .select("id, name, requires_patient, dispatching_dept_id")
      .eq("is_active", true)
      .order("name"),
  ]);

  const departmentIds = Array.from(
    new Set((catalogueItems ?? []).map((item) => item.dispatching_dept_id).filter(Boolean))
  ) as string[];

  const [{ data: staffUsers }, { data: userDepartments }] = await Promise.all([
    adminClient.from("staff_users").select("id, full_name, is_active").eq("is_active", true).order("full_name"),
    departmentIds.length > 0
      ? adminClient.from("user_departments").select("user_id, department_id").in("department_id", departmentIds)
      : Promise.resolve({ data: [] as Array<{ user_id: string; department_id: string }> }),
  ]);

  return NextResponse.json({
    patients: patients ?? [],
    catalogueItems: catalogueItems ?? [],
    staffUsers: staffUsers ?? [],
    userDepartments: userDepartments ?? [],
  });
}
