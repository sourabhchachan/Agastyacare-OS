import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";
import { createTriggeredItemInstances } from "@/lib/items/createItemInstances";

export async function POST(req: Request) {
  const auth = await requirePermission("raise_items");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as { catalogueItemId?: string; patientId?: string; notes?: string };
  if (!body.catalogueItemId || !body.patientId) {
    return NextResponse.json({ error: "catalogueItemId and patientId required" }, { status: 400 });
  }

  try {
    const result = await createTriggeredItemInstances(adminClient, {
      catalogueItemId: body.catalogueItemId,
      patientId: body.patientId,
      createdBy: auth.user.id,
      notes: body.notes,
    });
    const { data: staff } = await adminClient
      .from("staff_users")
      .select("full_name")
      .eq("id", result.assigneeId)
      .single();

    await adminClient.from("audit_logs").insert({
      actor_user_id: auth.user.id,
      event: "item_raised",
      table_name: "item_instances",
      record_id: result.instanceIds[0] ?? "unknown",
      new_data: { patientId: body.patientId, catalogueId: body.catalogueItemId, assignee: result.assigneeId },
    });

    return NextResponse.json({ ok: true, assigneeName: staff?.full_name ?? "Staff" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
