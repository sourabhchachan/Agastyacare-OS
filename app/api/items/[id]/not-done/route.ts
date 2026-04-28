import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { updateBillLineOnInstanceTerminal } from "@/lib/billing/billLines";

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
    .select("id, status, assigned_user_id")
    .eq("id", params.id)
    .single();
  if (e1 || !inst) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (inst.assigned_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!["pending", "in_progress"].includes(inst.status)) {
    return NextResponse.json({ error: "Item not updatable" }, { status: 400 });
  }

  await adminClient
    .from("item_instances")
    .update({
      status: "not_done",
      remarks: body.remarks.trim(),
      completed_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  try {
    await updateBillLineOnInstanceTerminal(adminClient, {
      instanceId: params.id,
      status: "not_done",
      remarks: body.remarks.trim(),
    });
  } catch (e) {
    console.error("bill line not_done", e);
  }

  await adminClient.from("audit_logs").insert({
    actor_user_id: user.id,
    event: "item_instance_not_done",
    table_name: "item_instances",
    record_id: params.id,
    new_data: { remarks: body.remarks.trim(), hhmm: new Date().toTimeString().slice(0, 5) },
  });

  return NextResponse.json({ ok: true });
}
