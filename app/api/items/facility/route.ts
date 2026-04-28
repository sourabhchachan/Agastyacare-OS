import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";
import { createFacilityItemInstance } from "@/lib/items/createItemInstances";

export async function POST(req: Request) {
  const auth = await requirePermission("build_system");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as {
    catalogueItemId?: string;
    assignedUserId?: string;
    dueAt?: string;
    notes?: string;
  };
  if (!body.catalogueItemId || !body.assignedUserId || !body.dueAt) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const ins = await createFacilityItemInstance(adminClient, {
      catalogueItemId: body.catalogueItemId,
      assignedUserId: body.assignedUserId,
      createdBy: auth.user.id,
      dueAt: body.dueAt,
      notes: body.notes,
    });
    await adminClient.from("audit_logs").insert({
      actor_user_id: auth.user.id,
      event: "facility_item_created",
      table_name: "item_instances",
      record_id: (ins as { id: string }).id,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 }
    );
  }
}
