import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";
import { allocateUniqueStaffId } from "@/lib/users/allocateStaffId";
import { hasDuplicateStaffInDepartments } from "@/lib/users/staffDuplicateCheck";

const domain = "agastya-hos.local";
const DEFAULT_PIN = "000000";

export async function POST(req: Request) {
  const auth = await requirePermission("admin.users.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const { fullName, departmentIds = [] } = body as {
    fullName: string;
    departmentIds?: string[];
  };

  const nameTrimmed = typeof fullName === "string" ? fullName.trim() : "";
  if (!nameTrimmed) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const deptIds = Array.isArray(departmentIds) ? departmentIds.filter((id): id is string => typeof id === "string") : [];
  if (await hasDuplicateStaffInDepartments(adminClient, nameTrimmed, deptIds)) {
    return NextResponse.json(
      { error: "A user with this name already exists in this department" },
      { status: 400 }
    );
  }

  const staffId = await allocateUniqueStaffId(adminClient);
  const email = `${staffId}@${domain}`;
  const { data: createdAuthUser, error: authCreateError } = await adminClient.auth.admin.createUser({
    email,
    password: DEFAULT_PIN,
    email_confirm: true,
    user_metadata: { staffId },
  });

  if (authCreateError || !createdAuthUser.user) {
    return NextResponse.json({ error: authCreateError?.message ?? "Failed to create auth user" }, { status: 400 });
  }

  const userId = createdAuthUser.user.id;
  const { error: profileError } = await adminClient.from("staff_users").insert({
    id: userId,
    staff_id: staffId,
    login_id: staffId,
    full_name: nameTrimmed,
    must_change_pin: true,
    is_active: true,
  });

  if (profileError) {
    await adminClient.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  if (deptIds.length > 0) {
    const rows = deptIds.map((departmentId) => ({ user_id: userId, department_id: departmentId }));
    const { error: deptError } = await adminClient.from("user_departments").insert(rows);
    if (deptError) {
      await adminClient.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: deptError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, userId });
}

export async function PATCH(req: Request) {
  const auth = await requirePermission("admin.users.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const { userId, isActive } = body as { userId: string; isActive: boolean };

  if (!userId || typeof isActive !== "boolean") {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { error } = await adminClient.from("staff_users").update({ is_active: isActive }).eq("id", userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
