import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";

const domain = "agastya-hos.local";

export async function POST(req: Request) {
  const auth = await requirePermission("admin.users.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const { staffId, fullName, pin, departmentIds = [] } = body as {
    staffId: string;
    fullName: string;
    pin: string;
    departmentIds?: string[];
  };

  if (!/^\d{10}$/.test(staffId) || !/^\d{4}$/.test(pin) || !fullName) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const email = `${staffId}@${domain}`;
  const { data: createdAuthUser, error: authCreateError } = await adminClient.auth.admin.createUser({
    email,
    password: pin,
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
    full_name: fullName,
    must_change_pin: true,
    is_active: true,
  });

  if (profileError) {
    await adminClient.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  if (departmentIds.length > 0) {
    const rows = departmentIds.map((departmentId) => ({ user_id: userId, department_id: departmentId }));
    const { error: deptError } = await adminClient.from("user_departments").insert(rows);
    if (deptError) {
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
