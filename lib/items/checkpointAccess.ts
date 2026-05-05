import type { SupabaseClient } from "@supabase/supabase-js";

export async function isCheckpointAssignmentAdmin(admin: SupabaseClient, userId: string): Promise<boolean> {
  const [{ data: m }, { data: b }] = await Promise.all([
    admin.rpc("has_permission", { p_user_id: userId, p_permission_code: "manage_users" }),
    admin.rpc("has_permission", { p_user_id: userId, p_permission_code: "build_system" }),
  ]);
  return Boolean(m === true || b === true);
}

export type CheckpointInstanceRow = {
  id?: string;
  step_number: number;
  status: string;
  department_id?: string | null;
  assigned_user_id?: string | null;
};
type CheckpointDefRow = {
  step_number: number;
  assignment_type: string | null;
  assigned_user_id: string | null;
  dept_id: string | null;
  department_id: string | null;
  is_recurring: boolean | null;
  recurrence_frequency: string | null;
  recurrence_end_date: string | null;
  due_offset_minutes: number | null;
};

/** Current actionable checkpoint: pending with no incomplete predecessor. */
export function findCurrentPendingCheckpoint(
  cps: CheckpointInstanceRow[]
): CheckpointInstanceRow | undefined {
  const ordered = [...cps].sort((a, b) => a.step_number - b.step_number);
  return ordered.find((cp) => {
    if (cp.status !== "pending") return false;
    const incompleteBefore = ordered.some(
      (o) => o.step_number < cp.step_number && o.status !== "completed"
    );
    return !incompleteBefore;
  });
}

export async function canUserActOnCurrentCheckpoint(
  admin: SupabaseClient,
  userId: string,
  instanceId: string,
  isAdmin: boolean
): Promise<boolean> {
  if (isAdmin) return true;
  const { data: inst } = await admin
    .from("item_instances")
    .select("id, status, catalogue_item_id")
    .eq("id", instanceId)
    .maybeSingle();
  if (!inst || !["pending", "in_progress"].includes(inst.status)) return false;

  const { data: cps } = await admin
    .from("item_checkpoint_instances")
    .select("step_number, status")
    .eq("instance_id", instanceId)
    .order("step_number", { ascending: true });
  const pending = findCurrentPendingCheckpoint((cps ?? []) as CheckpointInstanceRow[]);
  if (!pending) return false;

  const { data: def } = await admin
    .from("item_checkpoint_definitions")
    .select("step_number, assignment_type, assigned_user_id, dept_id")
    .eq("catalogue_item_id", inst.catalogue_item_id)
    .eq("step_number", pending.step_number)
    .maybeSingle();
  if (!def) return false;

  const row = def as CheckpointDefRow;
  const at = row.assignment_type ?? "department_pool";
  if (at === "specific_user") {
    return row.assigned_user_id === userId;
  }
  if (!row.dept_id) return false;
  const { data: ud } = await admin
    .from("user_departments")
    .select("user_id")
    .eq("user_id", userId)
    .eq("department_id", row.dept_id)
    .maybeSingle();
  return Boolean(ud);
}

export async function canUserViewItemInstance(
  admin: SupabaseClient,
  userId: string,
  instance: {
    id: string;
    assigned_user_id: string;
    created_by: string | null;
  },
  isAdmin: boolean
): Promise<boolean> {
  if (isAdmin) return true;
  if (instance.assigned_user_id === userId) return true;
  if (instance.created_by === userId) return true;
  if (await canUserActOnCurrentCheckpoint(admin, userId, instance.id, false)) return true;
  const { data: acted } = await admin
    .from("item_checkpoint_instances")
    .select("id")
    .eq("instance_id", instance.id)
    .eq("actor_user_id", userId)
    .limit(1)
    .maybeSingle();
  return Boolean(acted);
}
