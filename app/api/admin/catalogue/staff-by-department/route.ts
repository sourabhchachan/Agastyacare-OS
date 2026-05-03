import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";

export async function GET(req: Request) {
  const auth = await requirePermission("build_system");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const deptId = new URL(req.url).searchParams.get("department_id")?.trim() ?? "";
  if (!deptId) {
    return NextResponse.json({ error: "department_id is required" }, { status: 400 });
  }

  const { data: udRows, error: udErr } = await adminClient
    .from("user_departments")
    .select("user_id")
    .eq("department_id", deptId);
  if (udErr) return NextResponse.json({ error: udErr.message }, { status: 400 });

  const userIds = Array.from(new Set((udRows ?? []).map((r) => r.user_id)));
  if (userIds.length === 0) {
    return NextResponse.json({ staff: [] as { id: string; full_name: string }[] });
  }

  const { data: staffRows, error: suErr } = await adminClient
    .from("staff_users")
    .select("id, full_name")
    .in("id", userIds)
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  if (suErr) return NextResponse.json({ error: suErr.message }, { status: 400 });

  const staff = (staffRows ?? []).map((s) => ({ id: s.id, full_name: s.full_name ?? "" }));
  return NextResponse.json({ staff });
}
