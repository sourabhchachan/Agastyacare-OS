import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";

export async function GET() {
  const auth = await requirePermission("build_system");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data: items }, { data: staff }] = await Promise.all([
    adminClient.from("item_catalogue").select("id, name").eq("type", "facility").order("name"),
    adminClient.from("staff_users").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  return NextResponse.json({ items: items ?? [], staff: staff ?? [] });
}
