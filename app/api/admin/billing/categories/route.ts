import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/serverPermissions";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requirePermission(PERMISSIONS.ACCESS_FINANCIAL_DATA);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { data, error } = await adminClient
    .from("item_catalogue")
    .select("category")
    .not("category", "is", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const set = new Set<string>();
  for (const r of data ?? []) {
    const c = (r as { category: string | null }).category;
    if (c && c.trim()) set.add(c.trim());
  }
  return NextResponse.json({ categories: Array.from(set).sort() });
}
