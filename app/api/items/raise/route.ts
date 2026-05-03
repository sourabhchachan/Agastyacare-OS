import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";
import { createOrderedItemInstances } from "@/lib/items/createItemInstances";

export async function POST(req: Request) {
  const auth = await requirePermission("raise_items");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as {
    catalogueItemId?: string;
    patientId?: string;
    notes?: string;
    dueAt?: string;
    assignedUserId?: string;
    isRecurring?: boolean;
    recurrenceFrequency?: string;
    recurrenceDeadline?: string;
  };
  if (!body.catalogueItemId || !body.dueAt) {
    return NextResponse.json({ error: "catalogueItemId and dueAt are required" }, { status: 400 });
  }

  try {
    const result = await createOrderedItemInstances(adminClient, {
      catalogueItemId: body.catalogueItemId,
      patientId: body.patientId,
      dueAt: body.dueAt,
      createdBy: auth.user.id,
      notes: body.notes,
      assignedUserId: body.assignedUserId,
      isRecurring: body.isRecurring,
      recurrenceFrequency: body.recurrenceFrequency,
      recurrenceDeadline: body.recurrenceDeadline,
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

    return NextResponse.json({
      ok: true,
      assigneeName: staff?.full_name ?? "Staff",
      totalInstances: result.totalInstances,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
