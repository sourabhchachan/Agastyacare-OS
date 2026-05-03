import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/serverPermissions";

export async function GET() {
  const auth = await requirePermission("manage_users");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data: departments }, { data: users }, { data: assignments }, { data: userDepartments }] = await Promise.all([
    adminClient.from("departments").select("id, name").order("name"),
    adminClient.from("staff_users").select("id, full_name, is_active").eq("is_active", true).order("full_name"),
    adminClient
      .from("bed_assignments")
      .select("id, dept_id, assigned_user_id, bed_range_start, bed_range_end, assigned_at")
      .order("assigned_at", { ascending: false }),
    adminClient.from("user_departments").select("user_id, department_id"),
  ]);

  return NextResponse.json({
    departments: departments ?? [],
    users: users ?? [],
    assignments: assignments ?? [],
    userDepartments: userDepartments ?? [],
  });
}

export async function POST(req: Request) {
  const auth = await requirePermission("manage_users");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const body = (await req.json()) as {
    dept_id?: string;
    assigned_user_id?: string;
    bed_range_start?: string;
    bed_range_end?: string;
  };

  if (!body.dept_id || !body.assigned_user_id || !body.bed_range_start || !body.bed_range_end) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  const { data: targetUser } = await adminClient
    .from("staff_users")
    .select("id, is_active")
    .eq("id", body.assigned_user_id)
    .single();

  if (!targetUser?.is_active) {
    return NextResponse.json({ error: "Only active users can be assigned beds" }, { status: 400 });
  }

  const { error } = await adminClient.from("bed_assignments").insert({
    dept_id: body.dept_id,
    assigned_user_id: body.assigned_user_id,
    bed_range_start: body.bed_range_start,
    bed_range_end: body.bed_range_end,
    assigned_by: user?.id ?? null,
  });

  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const auth = await requirePermission("manage_users");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as {
    id?: string;
    assigned_user_id?: string;
    bed_range_start?: string;
    bed_range_end?: string;
  };

  if (!body.id || !body.assigned_user_id || !body.bed_range_start || !body.bed_range_end) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  const { data: targetUser } = await adminClient
    .from("staff_users")
    .select("id, is_active")
    .eq("id", body.assigned_user_id)
    .single();

  if (!targetUser?.is_active) {
    return NextResponse.json({ error: "Only active users can be assigned beds" }, { status: 400 });
  }

  const { error } = await adminClient
    .from("bed_assignments")
    .update({ assigned_user_id: body.assigned_user_id, bed_range_start: body.bed_range_start, bed_range_end: body.bed_range_end })
    .eq("id", body.id);

  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await requirePermission("manage_users");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await adminClient.from("bed_assignments").delete().eq("id", body.id);
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true });
}
