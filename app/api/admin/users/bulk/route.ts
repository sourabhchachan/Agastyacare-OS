import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";
import { allocateUniqueStaffId } from "@/lib/users/allocateStaffId";
import { hasDuplicateStaffInDepartments } from "@/lib/users/staffDuplicateCheck";

const domain = "agastya-hos.local";
const DEFAULT_PIN = "000000";

type BulkRowInput = {
  fullName: string;
  departmentName: string;
};

type FailureRow = {
  row: number;
  fullName: string;
  departmentName: string;
  reason: string;
};

export async function POST(req: Request) {
  const auth = await requirePermission("admin.users.bulk_import");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const rows = (body.rows ?? []) as BulkRowInput[];
  const failures: FailureRow[] = [];
  let createdCount = 0;

  const { data: departments, error: deptLoadErr } = await adminClient
    .from("departments")
    .select("id, name")
    .eq("is_active", true);
  if (deptLoadErr) {
    return NextResponse.json({ error: deptLoadErr.message }, { status: 400 });
  }

  const deptByLowerName = new Map(
    (departments ?? []).map((d) => [d.name.trim().toLowerCase(), { id: d.id, name: d.name }] as const)
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const excelRow = i + 2;
    const fullName = typeof row.fullName === "string" ? row.fullName.trim() : "";
    const departmentName = typeof row.departmentName === "string" ? row.departmentName.trim() : "";

    if (!fullName) {
      failures.push({ row: excelRow, fullName, departmentName, reason: "Full name is required" });
      continue;
    }
    if (!departmentName) {
      failures.push({ row: excelRow, fullName, departmentName, reason: "Department name is required" });
      continue;
    }

    const dept = deptByLowerName.get(departmentName.toLowerCase());
    if (!dept) {
      failures.push({
        row: excelRow,
        fullName,
        departmentName,
        reason: `Department not found: ${departmentName}`,
      });
      continue;
    }

    const departmentIds = [dept.id];
    if (await hasDuplicateStaffInDepartments(adminClient, fullName, departmentIds)) {
      failures.push({ row: excelRow, fullName, departmentName, reason: "Duplicate user" });
      continue;
    }

    let staffId: string;
    try {
      staffId = await allocateUniqueStaffId(adminClient);
    } catch {
      failures.push({ row: excelRow, fullName, departmentName, reason: "Could not allocate a unique staff ID" });
      continue;
    }

    const email = `${staffId}@${domain}`;
    const { data: createdAuthUser, error: authCreateError } = await adminClient.auth.admin.createUser({
      email,
      password: DEFAULT_PIN,
      email_confirm: true,
      user_metadata: { staffId },
    });

    if (authCreateError || !createdAuthUser.user) {
      failures.push({
        row: excelRow,
        fullName,
        departmentName,
        reason: authCreateError?.message ?? "Auth create failed",
      });
      continue;
    }

    const userId = createdAuthUser.user.id;
    const { error: profileError } = await adminClient.from("staff_users").insert({
      id: userId,
      staff_id: staffId,
      login_id: staffId,
      full_name: fullName,
      must_change_pin: true,
      is_active: true,
    });

    if (profileError) {
      await adminClient.auth.admin.deleteUser(userId);
      failures.push({ row: excelRow, fullName, departmentName, reason: profileError.message });
      continue;
    }

    const { error: deptError } = await adminClient
      .from("user_departments")
      .insert({ user_id: userId, department_id: dept.id });

    if (deptError) {
      await adminClient.auth.admin.deleteUser(userId);
      failures.push({ row: excelRow, fullName, departmentName, reason: deptError.message });
      continue;
    }

    createdCount += 1;
  }

  return NextResponse.json({
    ok: failures.length === 0,
    createdCount,
    failedCount: failures.length,
    failures,
  });
}
