import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { updateBillLineOnInstanceTerminal } from "@/lib/billing/billLines";
import {
  canUserActOnCurrentCheckpoint,
  canUserViewItemInstance,
  isCheckpointAssignmentAdmin,
} from "@/lib/items/checkpointAccess";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { remarks?: string };
  if (!body.remarks?.trim()) {
    return NextResponse.json({ error: "Remarks are required" }, { status: 400 });
  }

  const { data: inst, error: e1 } = await adminClient
    .from("item_instances")
    .select("id, status, assigned_user_id, created_by")
    .eq("id", params.id)
    .single();
  if (e1 || !inst) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = await isCheckpointAssignmentAdmin(adminClient, user.id);
  const readable = await canUserViewItemInstance(
    adminClient,
    user.id,
    { id: inst.id, assigned_user_id: inst.assigned_user_id, created_by: inst.created_by },
    isAdmin
  );
  if (!readable) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const canAct = await canUserActOnCurrentCheckpoint(adminClient, user.id, inst.id, isAdmin);
  const canCancel =
    isAdmin ||
    inst.assigned_user_id === user.id ||
    inst.created_by === user.id ||
    canAct;
  if (!canCancel) {
    return NextResponse.json(
      { error: "You do not have permission to cancel this item for this workflow step." },
      { status: 403 }
    );
  }
  if (!["pending", "in_progress"].includes(inst.status)) {
    return NextResponse.json({ error: "Item not cancellable" }, { status: 400 });
  }

  await adminClient
    .from("item_instances")
    .update({
      status: "cancelled",
      remarks: body.remarks.trim(),
      cancelled_by: user.id,
      completed_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  try {
    await updateBillLineOnInstanceTerminal(adminClient, {
      instanceId: params.id,
      status: "cancelled",
      remarks: body.remarks.trim(),
    });
  } catch (e) {
    console.error("bill line cancel", e);
  }

  await adminClient.from("audit_logs").insert({
    actor_user_id: user.id,
    event: "item_instance_cancelled",
    table_name: "item_instances",
    record_id: params.id,
    new_data: { remarks: body.remarks.trim(), hhmm: new Date().toTimeString().slice(0, 5) },
  });

  return NextResponse.json({ ok: true });
}
