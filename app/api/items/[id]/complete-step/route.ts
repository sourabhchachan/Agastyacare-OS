import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { updateBillLineAfterCheckpointStep } from "@/lib/billing/billLines";
import { findFirstActiveUserInDepartment, findUserIdForBedInDepartment } from "@/lib/items/bedAssignment";
import {
  canUserActOnCurrentCheckpoint,
  canUserViewItemInstance,
  findCurrentPendingCheckpoint,
  isCheckpointAssignmentAdmin,
  type CheckpointInstanceRow,
} from "@/lib/items/checkpointAccess";

function hhmmNow(): string {
  const t = new Date();
  return `${String(t.getHours()).padStart(2, "0")}${String(t.getMinutes()).padStart(2, "0")}`;
}

async function ownershipDeniedMessage(instanceId: string): Promise<string> {
  const { data: inst } = await adminClient
    .from("item_instances")
    .select("catalogue_item_id")
    .eq("id", instanceId)
    .maybeSingle();
  if (!inst) return "You are not allowed to complete this step.";
  const { data: cps } = await adminClient
    .from("item_checkpoint_instances")
    .select("step_number, status")
    .eq("instance_id", instanceId)
    .order("step_number", { ascending: true });
  const pending = findCurrentPendingCheckpoint((cps ?? []) as { step_number: number; status: string }[]);
  if (!pending) return "You are not allowed to complete this step.";
  const { data: def } = await adminClient
    .from("item_checkpoint_definitions")
    .select("assignment_type, assigned_user_id")
    .eq("catalogue_item_id", inst.catalogue_item_id)
    .eq("step_number", pending.step_number)
    .maybeSingle();
  const at = def?.assignment_type ?? "department_pool";
  if (at === "specific_user") {
    return "This step is reserved for the assigned staff member. If you need access, ask an administrator.";
  }
  return "Only members of the department responsible for this step can complete it. If you think this is wrong, check your department assignment or ask an administrator.";
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { proofNote?: string };
  const instanceId = params.id;
  const isAdmin = await isCheckpointAssignmentAdmin(adminClient, user.id);

  const { data: inst, error: e1 } = await adminClient
    .from("item_instances")
    .select("id, status, assigned_user_id, patient_id, catalogue_item_id, catalogue_type, created_by")
    .eq("id", instanceId)
    .single();
  if (e1 || !inst) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const readable = await canUserViewItemInstance(
    adminClient,
    user.id,
    {
      id: inst.id,
      assigned_user_id: inst.assigned_user_id,
      created_by: inst.created_by,
    },
    isAdmin
  );
  if (!readable) {
    return NextResponse.json({ error: "You do not have access to this item." }, { status: 403 });
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

  const pending = findCurrentPendingCheckpoint((cps ?? []) as CheckpointInstanceRow[]);
  if (!pending?.id) {
    return NextResponse.json({ error: "No pending step" }, { status: 400 });
  }
  const pendingRow = pending as CheckpointInstanceRow & { id: string };

  const canComplete = await canUserActOnCurrentCheckpoint(adminClient, user.id, instanceId, isAdmin);
  if (!canComplete) {
    const msg = await ownershipDeniedMessage(instanceId);
    return NextResponse.json({ error: msg }, { status: 403 });
  }

  const { data: defs, error: e3 } = await adminClient
    .from("item_checkpoint_definitions")
    .select("step_number")
    .eq("catalogue_item_id", inst.catalogue_item_id)
    .order("step_number", { ascending: true });
  if (e3) return NextResponse.json({ error: e3.message }, { status: 400 });

  const maxStep = Math.max(...(defs ?? []).map((d) => d.step_number), 0);
  const isLast = pendingRow.step_number >= maxStep;

  const today = new Date().toISOString().slice(0, 10);

  await adminClient
    .from("item_checkpoint_instances")
    .update({
      status: "completed",
      actor_user_id: user.id,
      claimed_by: user.id,
      actioned_date: today,
      actioned_time: hhmmNow(),
      proof_note: body.proofNote ?? null,
    })
    .eq("id", pendingRow.id);

  if (isLast) {
    await adminClient
      .from("item_instances")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", instanceId);
  } else {
    const nextStep = pendingRow.step_number + 1;
    const [{ data: nextDef }, { data: cat }, { data: patient }] = await Promise.all([
      adminClient
        .from("item_checkpoint_definitions")
        .select("dept_id, department_id, assigned_user_id")
        .eq("catalogue_item_id", inst.catalogue_item_id)
        .eq("step_number", nextStep)
        .maybeSingle(),
      adminClient
        .from("item_catalogue")
        .select("dispatching_dept_id")
        .eq("id", inst.catalogue_item_id)
        .maybeSingle(),
      inst.patient_id
        ? adminClient.from("patients").select("id, bed_number").eq("id", inst.patient_id).maybeSingle()
        : Promise.resolve({ data: null as { id: string; bed_number: string } | null }),
    ]);
    const routeDeptId =
      (nextDef as { department_id?: string | null; dept_id?: string | null } | null)?.department_id ??
      (nextDef as { department_id?: string | null; dept_id?: string | null } | null)?.dept_id ??
      cat?.dispatching_dept_id ??
      null;
    let routeUserId =
      (nextDef as { assigned_user_id?: string | null } | null)?.assigned_user_id ?? null;
    if (!routeUserId && routeDeptId) {
      if (inst.patient_id && patient?.bed_number) {
        routeUserId = await findUserIdForBedInDepartment(adminClient, routeDeptId, patient.bed_number);
      }
      if (!routeUserId) {
        routeUserId = await findFirstActiveUserInDepartment(adminClient, routeDeptId);
      }
    }
    if (!routeUserId) routeUserId = inst.assigned_user_id;

    await adminClient
      .from("item_checkpoint_instances")
      .update({
        status: "pending",
        department_id: routeDeptId,
        assigned_user_id: routeUserId,
      })
      .eq("instance_id", instanceId)
      .eq("step_number", nextStep)
      .eq("status", "locked");

    await adminClient
      .from("item_instances")
      .update({ status: "in_progress", assigned_user_id: routeUserId })
      .eq("id", instanceId);
  }

  await adminClient.from("audit_logs").insert({
    actor_user_id: user.id,
    event: isLast ? "item_instance_completed" : "item_checkpoint_completed",
    table_name: "item_instances",
    record_id: instanceId,
    new_data: { step: pendingRow.step_number, hhmm: hhmmNow() },
  });

  try {
    await updateBillLineAfterCheckpointStep(adminClient, {
      instanceId,
      stepNumber: pendingRow.step_number,
      isLast,
      userId: user.id,
    });
  } catch (e) {
    console.error("bill line update", e);
  }

  return NextResponse.json({ ok: true });
}
