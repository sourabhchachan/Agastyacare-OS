import type { SupabaseClient } from "@supabase/supabase-js";
import { findFirstActiveUserInDepartment, findUserIdForBedInDepartment } from "@/lib/items/bedAssignment";
import {
  buildRecurringDueList,
  getFirstDueRecurring,
} from "@/lib/items/frequency";
import { insertCheckpointInstancesForInstance } from "@/lib/items/checkpoints";
import { createBillLineForBilledInstance } from "@/lib/billing/billLines";

type CatalogueRow = {
  id: string;
  is_active: boolean;
  requires_patient: boolean;
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
    .select("id, is_active, requires_patient, ordering_dept_id, dispatching_dept_id, billing_flag, unit_cost")
    .eq("ordering_dept_id", params.admittingDeptId)
    .eq("is_active", true);

  if (e1) throw e1;
  const list = (items ?? []) as CatalogueRow[];
  const end = new Date(Date.now() + HORIZON_MS);
  const now = new Date();

  for (const cat of list) {
    if (!cat.dispatching_dept_id) continue;
    const assigneeByBed = await findUserIdForBedInDepartment(
      admin,
      cat.dispatching_dept_id,
      params.bedNumber
    );
    const assignee =
      assigneeByBed ?? (await findFirstActiveUserInDepartment(admin, cat.dispatching_dept_id));
    if (!assignee) continue;

    const first = getFirstDueRecurring(now, "24hr", null, null);
    const dues = buildRecurringDueList(first, "24hr", null, end);

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
          catalogue_type: null,
          is_recurring: true,
          recurrence_frequency: "24hr",
          recurrence_until: end.toISOString(),
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

function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

const RECURRENCE_HOURS: Record<string, number> = {
  "2hr": 2,
  "4hr": 4,
  "6hr": 6,
  "8hr": 8,
  "12hr": 12,
  "24hr": 24,
};

function addByRecurrence(base: Date, frequency: string): Date {
  const hourStep = RECURRENCE_HOURS[frequency];
  if (hourStep) return addHours(base, hourStep);
  if (frequency === "daily") return addHours(base, 24);
  if (frequency === "weekly") return addHours(base, 24 * 7);
  if (frequency === "monthly") {
    const next = new Date(base);
    next.setMonth(next.getMonth() + 1);
    return next;
  }
  if (frequency === "yearly") {
    const next = new Date(base);
    next.setFullYear(next.getFullYear() + 1);
    return next;
  }
  throw new Error("Invalid recurrence frequency");
}

export async function createOrderedItemInstances(
  admin: SupabaseClient,
  params: {
    catalogueItemId: string;
    patientId?: string | null;
    dueAt: string;
    createdBy: string;
    notes?: string | null;
    assignedUserId?: string | null;
    isRecurring?: boolean;
    recurrenceFrequency?: string | null;
    recurrenceDeadline?: string | null;
  }
) {
  const { data: cat, error: e1 } = await admin
    .from("item_catalogue")
    .select("id, is_active, requires_patient, dispatching_dept_id, billing_flag, unit_cost")
    .eq("id", params.catalogueItemId)
    .single();
  if (e1 || !cat) throw e1 ?? new Error("Catalogue not found");
  if (!cat.is_active) throw new Error("Catalogue item is inactive");

  if (!cat.dispatching_dept_id) throw new Error("Catalogue item has no fulfilling department");
  let patient: { id: string; is_active: boolean; bed_number: string } | null = null;
  let assignee: string | null = params.assignedUserId ?? null;

  if (cat.requires_patient) {
    if (!params.patientId) throw new Error("Patient is required for this item");
    const { data: patientRow, error: e2 } = await admin
      .from("patients")
      .select("id, is_active, bed_number")
      .eq("id", params.patientId)
      .single();
    if (e2 || !patientRow?.is_active) throw e2 ?? new Error("Patient not active");
    patient = patientRow;
  }

  if (assignee) {
    const { data: assignedUser, error: assignedErr } = await admin
      .from("staff_users")
      .select("id, is_active")
      .eq("id", assignee)
      .maybeSingle();
    if (assignedErr || !assignedUser?.is_active) {
      throw new Error("Selected assignee is not active");
    }
    const { data: mapped } = await admin
      .from("user_departments")
      .select("user_id")
      .eq("user_id", assignee)
      .eq("department_id", cat.dispatching_dept_id)
      .maybeSingle();
    if (!mapped) throw new Error("Selected assignee is not in fulfilling department");
  } else if (cat.requires_patient && patient) {
    const byBed = await findUserIdForBedInDepartment(admin, cat.dispatching_dept_id, patient.bed_number);
    assignee = byBed ?? (await findFirstActiveUserInDepartment(admin, cat.dispatching_dept_id));
  } else {
    assignee = await findFirstActiveUserInDepartment(admin, cat.dispatching_dept_id);
  }
  if (!assignee) throw new Error("No staff available in fulfilling department");

  const baseDue = new Date(params.dueAt);
  if (Number.isNaN(baseDue.getTime())) throw new Error("Invalid due time");

  const dueMoments: Date[] = [baseDue];
  const isRecurring = Boolean(params.isRecurring);
  if (isRecurring) {
    const freq = params.recurrenceFrequency ?? "24hr";
    addByRecurrence(baseDue, freq);
    const deadlineRaw = params.recurrenceDeadline;
    if (!deadlineRaw) throw new Error("Recurring item requires recurrence deadline");
    const deadline = new Date(deadlineRaw);
    if (Number.isNaN(deadline.getTime()) || deadline <= baseDue) {
      throw new Error("Recurrence deadline must be after due time");
    }

    let next = addByRecurrence(baseDue, freq);
    let guard = 0;
    while (next <= deadline && guard < 200) {
      dueMoments.push(next);
      next = addByRecurrence(next, freq);
      guard += 1;
    }
  }

  const created: { id: string }[] = [];
  for (const due of dueMoments) {
    const { data: ins, error: e3 } = await admin
      .from("item_instances")
      .insert({
        catalogue_item_id: cat.id,
        assigned_user_id: assignee,
        patient_id: patient?.id ?? null,
        status: "pending",
        due_at: due.toISOString(),
        created_by: params.createdBy,
        remarks: params.notes ?? null,
        catalogue_type: null,
        is_recurring: isRecurring,
        recurrence_frequency: isRecurring ? (params.recurrenceFrequency ?? null) : null,
        recurrence_until: isRecurring ? (params.recurrenceDeadline ?? null) : null,
      })
      .select("id")
      .single();
    if (e3) throw e3;
    if (ins) {
      await insertCheckpointInstancesForInstance(admin, ins.id, cat.id);
      await createBillLineForBilledInstance(admin, {
        instanceId: ins.id,
        patientId: patient?.id ?? null,
        catalogueItemId: cat.id,
        createdBy: params.createdBy,
        billingFlag: Boolean(cat.billing_flag),
        unitCost: Number(cat.unit_cost ?? 0),
      });
      created.push(ins);
    }
  }

  return { assigneeId: assignee, instanceIds: created.map((c) => c.id), totalInstances: created.length };
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
  return createOrderedItemInstances(admin, {
    catalogueItemId: params.catalogueItemId,
    patientId: params.patientId,
    dueAt: new Date().toISOString(),
    createdBy: params.createdBy,
    notes: params.notes,
  });
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
    .select("id, billing_flag, unit_cost")
    .eq("id", params.catalogueItemId)
    .single();
  if (e1 || !cat) throw e1 ?? new Error("Catalogue not found");
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
      catalogue_type: null,
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
