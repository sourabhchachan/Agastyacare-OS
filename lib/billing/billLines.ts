import type { SupabaseClient } from "@supabase/supabase-js";

function orderDateString(d: Date) {
  return d.toISOString().slice(0, 10);
}

function orderTimeHhmm(d: Date) {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}`;
}

export async function createBillLineForBilledInstance(
  admin: SupabaseClient,
  params: {
    instanceId: string;
    patientId: string | null;
    catalogueItemId: string;
    createdBy: string | null;
    billingFlag: boolean;
    unitCost: number;
  }
) {
  if (!params.billingFlag) return;
  const now = new Date();
  const { error } = await admin.from("bill_lines").insert({
    patient_id: params.patientId,
    instance_id: params.instanceId,
    catalogue_item_id: params.catalogueItemId,
    quantity: 1,
    unit_cost_at_order: params.unitCost,
    ordered_by: params.createdBy,
    order_date: orderDateString(now),
    order_time: orderTimeHhmm(now),
    status: "ordered",
  });
  if (error) throw error;
}

export async function updateBillLineAfterCheckpointStep(
  admin: SupabaseClient,
  params: { instanceId: string; stepNumber: number; isLast: boolean; userId: string }
) {
  const { data: line } = await admin
    .from("bill_lines")
    .select("id")
    .eq("instance_id", params.instanceId)
    .maybeSingle();
  if (!line) return;

  const { data: inst, error: e1 } = await admin
    .from("item_instances")
    .select("catalogue_item_id")
    .eq("id", params.instanceId)
    .single();
  if (e1 || !inst) return;

  const { data: cat, error: e2 } = await admin
    .from("item_catalogue")
    .select("ordering_dept_id, dispatching_dept_id, billing_flag")
    .eq("id", inst.catalogue_item_id)
    .single();
  if (e2 || !cat || !cat.billing_flag) return;

  const { data: def, error: e3 } = await admin
    .from("item_checkpoint_definitions")
    .select("dept_id")
    .eq("catalogue_item_id", inst.catalogue_item_id)
    .eq("step_number", params.stepNumber)
    .maybeSingle();
  if (e3 || !def?.dept_id) return;

  const did = def.dept_id;
  const oDept = cat.ordering_dept_id;
  const dDept = cat.dispatching_dept_id;
  const isDispatch = !!dDept && did === dDept;
  const isOrder = !!oDept && did === oDept;
  if (!isDispatch && !isOrder) return;

  const today = orderDateString(new Date());
  const hh = orderTimeHhmm(new Date());
  const u: Record<string, unknown> = {};

  if (isDispatch) {
    u.dispatched_by = params.userId;
    u.dispatch_date = today;
    u.dispatch_time = hh;
  }
  if (params.isLast) {
    if (isOrder) {
      u.received_by = params.userId;
      u.receive_date = today;
      u.receive_time = hh;
      u.status = "received";
    } else if (isDispatch) {
      u.status = "dispatched";
    }
  } else if (isDispatch) {
    u.status = "dispatched";
  }

  if (Object.keys(u).length === 0) return;

  const { error } = await admin.from("bill_lines").update(u).eq("id", line.id);
  if (error) throw error;
}

export async function updateBillLineOnInstanceTerminal(
  admin: SupabaseClient,
  params: { instanceId: string; status: "cancelled" | "not_done"; remarks: string }
) {
  const { data: line } = await admin
    .from("bill_lines")
    .select("id")
    .eq("instance_id", params.instanceId)
    .maybeSingle();
  if (!line) return;

  const { error } = await admin
    .from("bill_lines")
    .update({
      status: params.status,
      cancellation_remarks: params.remarks,
    })
    .eq("id", line.id);
  if (error) throw error;
}
