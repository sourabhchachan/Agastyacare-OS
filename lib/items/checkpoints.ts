import type { SupabaseClient } from "@supabase/supabase-js";
import { findFirstActiveUserInDepartment, findUserIdForBedInDepartment } from "@/lib/items/bedAssignment";

export async function insertCheckpointInstancesForInstance(
  admin: SupabaseClient,
  instanceId: string,
  catalogueItemId: string,
  options?: {
    fallbackDepartmentId?: string | null;
    defaultAssignedUserId?: string | null;
    patientId?: string | null;
    bedNumber?: string | null;
  }
) {
  const { data: defs, error: defErr } = await admin
    .from("item_checkpoint_definitions")
    .select("step_number, description, dept_id, department_id, assigned_user_id")
    .eq("catalogue_item_id", catalogueItemId)
    .order("step_number", { ascending: true });

  if (defErr) throw defErr;
  if (!defs?.length) throw new Error("Catalogue item has no sub-task definitions");

  const ordered = [...defs].sort((a, b) => a.step_number - b.step_number);
  const rows: Array<{
    instance_id: string;
    step_number: number;
    status: "pending" | "locked";
    department_id: string | null;
    assigned_user_id: string | null;
  }> = [];
  for (let index = 0; index < ordered.length; index++) {
    const d = ordered[index];
    const deptId = d.department_id ?? d.dept_id ?? options?.fallbackDepartmentId ?? null;
    let assignee = d.assigned_user_id ?? null;
    if (!assignee && deptId) {
      if (options?.patientId && options?.bedNumber) {
        assignee = await findUserIdForBedInDepartment(admin, deptId, options.bedNumber);
      }
      if (!assignee) {
        assignee = await findFirstActiveUserInDepartment(admin, deptId);
      }
    }
    if (!assignee) assignee = options?.defaultAssignedUserId ?? null;
    rows.push({
      instance_id: instanceId,
      step_number: d.step_number,
      status: index === 0 ? "pending" : "locked",
      department_id: deptId,
      assigned_user_id: assignee,
    });
  }

  const { error } = await admin.from("item_checkpoint_instances").insert(rows);
  if (error) throw error;
}
