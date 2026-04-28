import type { SupabaseClient } from "@supabase/supabase-js";
import { findFirstActiveUserInDepartment, findUserIdForBedInDepartment } from "@/lib/items/bedAssignment";
import {
  buildRecurringDueList,
  getFirstDueRecurring,
  getTriggeredDueAt,
  getTriggeredInstanceCount,
} from "@/lib/items/frequency";
import { insertCheckpointInstancesForInstance } from "@/lib/items/checkpoints";
import { createBillLineForBilledInstance } from "@/lib/billing/billLines";

type CatalogueRow = {
  id: string;
  type: "recurring" | "triggered" | "facility";
  frequency: string;
  frequency_time: string | null;
  frequency_day: string | null;
  ordering_dept_id: string | null;
  dispatching_dept_id: string | null;
  billing_flag: boolean;
  unit_cost: number | null;
};

const HORIZON_MS = 14 * 24 * 60 * 60 * 1000;

export async function createRecurringItemInstancesOnAdmit(
  admin: SupabaseClient,
  params: { patientId: string; bedNumber: string; admittingDeptId: string; createdBy: string | null }
) {
  const { data: items, error: e1 } = await admin
    .from("item_catalogue")
    .select(
      "id, type, frequency, frequency_time, frequency_day, ordering_dept_id, dispatching_dept_id, billing_flag, unit_cost"
    )
    .eq("type", "recurring")
    .eq("ordering_dept_id", params.admittingDeptId);

  if (e1) throw e1;
  const list = (items ?? []) as CatalogueRow[];
  const end = new Date(Date.now() + HORIZON_MS);
  const now = new Date();

  for (const cat of list) {
    if (!cat.dispatching_dept_id) continue;
    const assignee = await findUserIdForBedInDepartment(
      admin,
      cat.dispatching_dept_id,
      params.bedNumber
    );
    if (!assignee) continue;

    const first = getFirstDueRecurring(
      now,
      cat.frequency,
      cat.frequency_time,
      cat.frequency_day
    );
    const dues = buildRecurringDueList(first, cat.frequency, cat.frequency_time, end);

    for (const due of dues) {
      const { data: ins, error: e2 } = await admin
        .from("item_instances")
        .insert({
          catalogue_item_id: cat.id,
          assigned_user_id: assignee,
          patient_id: params.patientId,
          status: "pending",
          due_at: due.toISOString(),
          created_by: params.createdBy,
          catalogue_type: "recurring",
        })
        .select("id")
        .single();
      if (e2) throw e2;
      if (ins) {
        await insertCheckpointInstancesForInstance(admin, ins.id, cat.id);
        await createBillLineForBilledInstance(admin, {
          instanceId: ins.id,
          patientId: params.patientId,
          catalogueItemId: cat.id,
          createdBy: params.createdBy,
          billingFlag: Boolean(cat.billing_flag),
          unitCost: Number(cat.unit_cost ?? 0),
        });
      }
    }
  }
}

export async function createTriggeredItemInstances(
  admin: SupabaseClient,
  params: {
    catalogueItemId: string;
    patientId: string;
    createdBy: string;
    notes?: string | null;
  }
) {
  const { data: cat, error: e1 } = await admin
    .from("item_catalogue")
    .select("id, type, frequency, frequency_time, frequency_day, dispatching_dept_id, billing_flag, unit_cost")
    .eq("id", params.catalogueItemId)
    .single();

  if (e1 || !cat) throw e1 ?? new Error("Catalogue not found");
  if (cat.type !== "triggered") throw new Error("Only triggered items can be raised this way");

  const { data: patient, error: e2 } = await admin
    .from("patients")
    .select("id, is_active, bed_number")
    .eq("id", params.patientId)
    .single();
  if (e2 || !patient?.is_active) throw e2 ?? new Error("Patient not active");

  if (!cat.dispatching_dept_id) throw new Error("Catalogue item has no dispatching department");

  const assignee = await findUserIdForBedInDepartment(
    admin,
    cat.dispatching_dept_id,
    patient.bed_number
  );
  if (!assignee) throw new Error("No staff assigned to this bed in the dispatching department");

  const n = getTriggeredInstanceCount(cat.frequency);
  const now = new Date();
  const created: { id: string }[] = [];

  for (let i = 0; i < n; i += 1) {
    const due = getTriggeredDueAt(now, cat.frequency, i);
    const { data: ins, error: e3 } = await admin
      .from("item_instances")
      .insert({
        catalogue_item_id: cat.id,
        assigned_user_id: assignee,
        patient_id: params.patientId,
        status: "pending",
        due_at: due.toISOString(),
        created_by: params.createdBy,
        remarks: params.notes ?? null,
        catalogue_type: "triggered",
      })
      .select("id")
      .single();
    if (e3) throw e3;
    if (ins) {
      await insertCheckpointInstancesForInstance(admin, ins.id, cat.id);
      await createBillLineForBilledInstance(admin, {
        instanceId: ins.id,
        patientId: params.patientId,
        catalogueItemId: cat.id,
        createdBy: params.createdBy,
        billingFlag: Boolean(
          (cat as { billing_flag?: boolean }).billing_flag
        ),
        unitCost: Number((cat as { unit_cost?: number | null }).unit_cost ?? 0),
      });
      created.push(ins);
    }
  }

  return { assigneeId: assignee, instanceIds: created.map((c) => c.id) };
}

export async function createFacilityItemInstance(
  admin: SupabaseClient,
  params: {
    catalogueItemId: string;
    assignedUserId: string;
    createdBy: string;
    dueAt: string;
    notes?: string | null;
  }
) {
  const { data: cat, error: e1 } = await admin
    .from("item_catalogue")
    .select("id, type, frequency, frequency_time, frequency_day, dispatching_dept_id, billing_flag, unit_cost")
    .eq("id", params.catalogueItemId)
    .single();
  if (e1 || !cat) throw e1 ?? new Error("Catalogue not found");
  if (cat.type !== "facility") throw new Error("Not a facility catalogue item");
  const facCat = cat as { id: string; billing_flag?: boolean; unit_cost?: number | null };

  const { data: ins, error: e2 } = await admin
    .from("item_instances")
    .insert({
      catalogue_item_id: cat.id,
      assigned_user_id: params.assignedUserId,
      patient_id: null,
      status: "pending",
      due_at: params.dueAt,
      created_by: params.createdBy,
      remarks: params.notes ?? null,
      catalogue_type: "facility",
    })
    .select("id")
    .single();
  if (e2) throw e2;
  if (ins) {
    await insertCheckpointInstancesForInstance(admin, ins.id, cat.id);
    await createBillLineForBilledInstance(admin, {
      instanceId: ins.id,
      patientId: null,
      catalogueItemId: facCat.id,
      createdBy: params.createdBy,
      billingFlag: Boolean(facCat.billing_flag),
      unitCost: Number(facCat.unit_cost ?? 0),
    });
  }
  return ins;
}

export async function resolveAssigneeForStep(
  admin: SupabaseClient,
  params: {
    patientId: string | null;
    bedNumber: string | null;
    deptId: string;
    facilityFixedUserId: string;
  }
): Promise<string> {
  if (!params.patientId || !params.bedNumber) {
    return params.facilityFixedUserId;
  }
  const u = await findUserIdForBedInDepartment(admin, params.deptId, params.bedNumber);
  if (u) return u;
  const fallback = await findFirstActiveUserInDepartment(admin, params.deptId);
  if (fallback) return fallback;
  return params.facilityFixedUserId;
}

/** Grouped entry points for item instance creation (server-side). */
export const createItemInstances = {
  onPatientAdmit: createRecurringItemInstancesOnAdmit,
  raiseTriggered: createTriggeredItemInstances,
  createFacility: createFacilityItemInstance,
};
