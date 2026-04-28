import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { resolveAssigneeForStep } from "@/lib/items/createItemInstances";
import { updateBillLineAfterCheckpointStep } from "@/lib/billing/billLines";

function hhmmNow(): string {
  const t = new Date();
  return `${String(t.getHours()).padStart(2, "0")}${String(t.getMinutes()).padStart(2, "0")}`;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { proofNote?: string };
  const instanceId = params.id;

  const { data: inst, error: e1 } = await adminClient
    .from("item_instances")
    .select("id, status, assigned_user_id, patient_id, catalogue_item_id, catalogue_type")
    .eq("id", instanceId)
    .single();
  if (e1 || !inst) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (inst.assigned_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!["pending", "in_progress"].includes(inst.status)) {
    return NextResponse.json({ error: "Item is not active" }, { status: 400 });
  }

  const { data: cps, error: e2 } = await adminClient
    .from("item_checkpoint_instances")
    .select("id, step_number, status")
    .eq("instance_id", instanceId)
    .order("step_number", { ascending: true });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });

  const pending = (cps ?? []).find((c) => c.status === "pending");
  if (!pending) return NextResponse.json({ error: "No pending step" }, { status: 400 });

  const { data: defs, error: e3 } = await adminClient
    .from("item_checkpoint_definitions")
    .select("step_number, dept_id")
    .eq("catalogue_item_id", inst.catalogue_item_id)
    .order("step_number", { ascending: true });
  if (e3) return NextResponse.json({ error: e3.message }, { status: 400 });

  const defMap = new Map((defs ?? []).map((d) => [d.step_number, d.dept_id]));
  const maxStep = Math.max(...(defs ?? []).map((d) => d.step_number), 0);
  const isLast = pending.step_number >= maxStep;

  const today = new Date().toISOString().slice(0, 10);

  await adminClient
    .from("item_checkpoint_instances")
    .update({
      status: "completed",
      actor_user_id: user.id,
      actioned_date: today,
      actioned_time: hhmmNow(),
      proof_note: body.proofNote ?? null,
    })
    .eq("id", pending.id);

  if (isLast) {
    await adminClient
      .from("item_instances")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", instanceId);
  } else {
    const nextStep = pending.step_number + 1;
    const nextDept = defMap.get(nextStep);
    const { data: pat } = inst.patient_id
      ? await adminClient.from("patients").select("bed_number").eq("id", inst.patient_id).single()
      : { data: null };

    const nextUser = nextDept
      ? await resolveAssigneeForStep(adminClient, {
          patientId: inst.patient_id,
          bedNumber: pat?.bed_number ?? null,
          deptId: nextDept,
          facilityFixedUserId: inst.assigned_user_id,
        })
      : inst.assigned_user_id;

    await adminClient
      .from("item_instances")
      .update({ status: "in_progress", assigned_user_id: nextUser })
      .eq("id", instanceId);
  }

  await adminClient.from("audit_logs").insert({
    actor_user_id: user.id,
    event: isLast ? "item_instance_completed" : "item_checkpoint_completed",
    table_name: "item_instances",
    record_id: instanceId,
    new_data: { step: pending.step_number, hhmm: hhmmNow() },
  });

  try {
    await updateBillLineAfterCheckpointStep(adminClient, {
      instanceId,
      stepNumber: pending.step_number,
      isLast,
      userId: user.id,
    });
  } catch (e) {
    console.error("bill line update", e);
  }

  return NextResponse.json({ ok: true });
}
