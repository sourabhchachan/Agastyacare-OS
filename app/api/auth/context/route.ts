import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

type StaffProfile = {
  id: string;
  staff_id: string;
  full_name: string;
  is_active: boolean;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const sessionUserId = user.id;
  const sessionMetaStaffId = String(user.user_metadata?.staffId ?? "");
  const sessionEmailPrefix = (user.email ?? "").split("@")[0] ?? "";
  const fallbackStaffId =
    sessionMetaStaffId || (/^\d{10}$/.test(sessionEmailPrefix) ? sessionEmailPrefix : "");

  let profile: StaffProfile | null = null;
  const { data: byId } = await adminClient
    .from("staff_users")
    .select("id, staff_id, full_name, is_active")
    .eq("id", sessionUserId)
    .maybeSingle();
  profile = (byId as StaffProfile | null) ?? null;

  if (!profile && fallbackStaffId) {
    const { data: byStaffId } = await adminClient
      .from("staff_users")
      .select("id, staff_id, full_name, is_active")
      .eq("staff_id", fallbackStaffId)
      .maybeSingle();
    profile = (byStaffId as StaffProfile | null) ?? null;
  }

  if (!profile) {
    return NextResponse.json({
      profile: null,
      departments: [],
      permissions: [],
    });
  }

  const { data: userDepartments } = await adminClient
    .from("user_departments")
    .select("department_id")
    .eq("user_id", profile.id);
  const departmentIds = Array.from(new Set((userDepartments ?? []).map((row) => row.department_id)));

  const [{ data: deptRows }, { data: deptPermissionRows }] = await Promise.all([
    departmentIds.length > 0
      ? adminClient.from("departments").select("id, name").in("id", departmentIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    departmentIds.length > 0
      ? adminClient.from("department_permissions").select("permission_id").in("department_id", departmentIds)
      : Promise.resolve({ data: [] as Array<{ permission_id: string }> }),
  ]);

  const permissionIds = Array.from(
    new Set((deptPermissionRows ?? []).map((row) => row.permission_id))
  );
  const { data: permissionRows } =
    permissionIds.length > 0
      ? await adminClient.from("permissions").select("id, code").in("id", permissionIds)
      : { data: [] as Array<{ id: string; code: string }> };

  const deptNameById = new Map((deptRows ?? []).map((row) => [row.id, row.name]));
  const departments = departmentIds.map((id) => deptNameById.get(id)).filter(Boolean) as string[];
  const permissions = Array.from(new Set((permissionRows ?? []).map((row) => row.code)));

  return NextResponse.json({
    profile: {
      id: profile.id,
      staffId: profile.staff_id,
      fullName: profile.full_name,
      isActive: profile.is_active,
    },
    departments,
    permissions,
  });
}
