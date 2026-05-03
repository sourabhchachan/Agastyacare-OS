import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(req: Request) {
  const auth = await requirePermission("admin.departments.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = body as {
    code?: unknown;
    name?: unknown;
    description?: unknown;
    permissionIds?: unknown;
  };

  const code = typeof input.code === "string" ? input.code.trim().toLowerCase() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description =
    typeof input.description === "string" ? (input.description.trim() || null) : null;
  const permissionIds = Array.isArray(input.permissionIds)
    ? input.permissionIds.filter((id): id is string => typeof id === "string")
    : [];

  if (!code || !name) {
    return NextResponse.json({ error: "Department code and name are required" }, { status: 400 });
  }

  if (!/^[a-z0-9-]+$/.test(code)) {
    return NextResponse.json(
      { error: "Department code can only contain lowercase letters, numbers, and hyphens" },
      { status: 400 }
    );
  }

  if (permissionIds.some((id) => !isUuid(id))) {
    return NextResponse.json({ error: "Invalid permissionIds" }, { status: 400 });
  }

  const { data: department, error } = await adminClient
    .from("departments")
    .insert({ code, name, description })
    .select("id")
    .single();

  if (error || !department) {
    if (error?.code === "23505") {
      return NextResponse.json({ error: "Department code already exists" }, { status: 409 });
    }
    return NextResponse.json(
      { error: error?.message ?? "Failed to create department" },
      { status: 400 }
    );
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
