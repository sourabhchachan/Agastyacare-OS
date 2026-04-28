import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";

export async function POST(req: Request) {
  const auth = await requirePermission("admin.departments.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const { code, name, description, permissionIds = [] } = body as {
    code: string;
    name: string;
    description?: string;
    permissionIds?: string[];
  };

  if (!code || !name) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { data: department, error } = await adminClient
    .from("departments")
    .insert({ code, name, description: description ?? null })
    .select("id")
    .single();

  if (error || !department) {
    return NextResponse.json({ error: error?.message ?? "Failed to create department" }, { status: 400 });
  }

  if (permissionIds.length > 0) {
    const rows = permissionIds.map((permissionId) => ({ department_id: department.id, permission_id: permissionId }));
    const { error: permError } = await adminClient.from("department_permissions").insert(rows);
    if (permError) {
      return NextResponse.json({ error: permError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const auth = await requirePermission("admin.departments.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const { departmentId, permissionIds } = body as {
    departmentId: string;
    permissionIds: string[];
  };

  if (!departmentId || !Array.isArray(permissionIds)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { error: deleteError } = await adminClient
    .from("department_permissions")
    .delete()
    .eq("department_id", departmentId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  if (permissionIds.length > 0) {
    const rows = permissionIds.map((permissionId) => ({ department_id: departmentId, permission_id: permissionId }));
    const { error: insertError } = await adminClient.from("department_permissions").insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}
