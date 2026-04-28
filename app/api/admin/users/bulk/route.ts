import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";

const domain = "agastya-hos.local";

type BulkRow = {
  staffId: string;
  fullName: string;
  pin: string;
  departmentIds?: string[];
};

export async function POST(req: Request) {
  const auth = await requirePermission("admin.users.bulk_import");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const rows = (body.rows ?? []) as BulkRow[];
  const failures: Array<{ staffId: string; error: string }> = [];

  for (const row of rows) {
    const { staffId, fullName, pin, departmentIds = [] } = row;

    if (!/^\d{10}$/.test(staffId) || !/^\d{4}$/.test(pin) || !fullName) {
      failures.push({ staffId, error: "Invalid input" });
      continue;
    }

    const email = `${staffId}@${domain}`;
    const { data: createdAuthUser, error: authCreateError } = await adminClient.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
      user_metadata: { staffId },
    });

    if (authCreateError || !createdAuthUser.user) {
      failures.push({ staffId, error: authCreateError?.message ?? "Auth create failed" });
      continue;
    }

    const userId = createdAuthUser.user.id;
    const { error: profileError } = await adminClient.from("staff_users").insert({
      id: userId,
      staff_id: staffId,
      full_name: fullName,
      must_change_pin: true,
      is_active: true,
    });

    if (profileError) {
      await adminClient.auth.admin.deleteUser(userId);
      failures.push({ staffId, error: profileError.message });
      continue;
    }

    if (departmentIds.length > 0) {
      const rowsToInsert = departmentIds.map((departmentId) => ({ user_id: userId, department_id: departmentId }));
      const { error: deptError } = await adminClient.from("user_departments").insert(rowsToInsert);
      if (deptError) {
        failures.push({ staffId, error: deptError.message });
      }
    }
  }

  return NextResponse.json({ ok: failures.length === 0, failures });
}
