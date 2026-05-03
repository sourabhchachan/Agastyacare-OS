import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requireHandoverAccess } from "@/lib/auth/handoverAccess";

/** Pending / in-progress item instances assigned to a user (by assigned_user_id). */
export async function GET(req: Request) {
  const auth = await requireHandoverAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const userId = new URL(req.url).searchParams.get("userId")?.trim() ?? "";
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const { data: instances, error } = await adminClient
    .from("item_instances")
    .select("id, due_at, status, patient_id, catalogue_item_id")
    .eq("assigned_user_id", userId)
    .in("status", ["pending", "in_progress"])
    .order("due_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const catIds = Array.from(new Set((instances ?? []).map((r) => r.catalogue_item_id).filter(Boolean))) as string[];
  const { data: cats } =
    catIds.length > 0
      ? await adminClient.from("item_catalogue").select("id, name").in("id", catIds)
      : { data: [] as { id: string; name: string }[] };
  const catBy = new Map((cats ?? []).map((c) => [c.id, c.name]));

  const list = (instances ?? []).map((row) => ({
    id: row.id,
    due_at: row.due_at,
    status: row.status,
    patient_id: row.patient_id,
    item_name: catBy.get(row.catalogue_item_id) ?? "Item",
  }));

  return NextResponse.json({ tasks: list });
}
