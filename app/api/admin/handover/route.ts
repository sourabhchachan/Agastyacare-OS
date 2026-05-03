import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requireHandoverAccess } from "@/lib/auth/handoverAccess";

/** Active staff + recent task handover log (last 20). */
export async function GET() {
  const auth = await requireHandoverAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data: staff }, { data: logs }] = await Promise.all([
    adminClient.from("staff_users").select("id, full_name").eq("is_active", true).order("full_name", { ascending: true }),
    adminClient
      .from("handover_log")
      .select("id, from_user_id, to_user_id, item_count, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const ids = new Set<string>();
  for (const row of logs ?? []) {
    ids.add(row.from_user_id);
    ids.add(row.to_user_id);
  }
  const idList = Array.from(ids);
  const { data: names } =
    idList.length > 0
      ? await adminClient.from("staff_users").select("id, full_name").in("id", idList)
      : { data: [] as { id: string; full_name: string }[] };

  const nameBy = new Map((names ?? []).map((n) => [n.id, n.full_name]));

  const recent = (logs ?? []).map((row) => ({
    id: row.id,
    from_user_id: row.from_user_id,
    to_user_id: row.to_user_id,
    from_name: nameBy.get(row.from_user_id) ?? "Unknown",
    to_name: nameBy.get(row.to_user_id) ?? "Unknown",
    item_count: row.item_count,
    notes: row.notes,
    created_at: row.created_at,
  }));

  return NextResponse.json({ staff: staff ?? [], recent });
}
