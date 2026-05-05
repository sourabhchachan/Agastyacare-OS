import type { SupabaseClient } from "@supabase/supabase-js";

export async function insertCheckpointInstancesForInstance(
  admin: SupabaseClient,
  instanceId: string,
  catalogueItemId: string
) {
  const { data: defs, error: defErr } = await admin
    .from("item_checkpoint_definitions")
    .select("step_number, description, dept_id")
    .eq("catalogue_item_id", catalogueItemId)
    .order("step_number", { ascending: true });

  if (defErr) throw defErr;
  if (!defs?.length) throw new Error("Catalogue item has no sub-task definitions");

  const ordered = [...defs].sort((a, b) => a.step_number - b.step_number);
  const rows = ordered.map((d, index) => ({
    instance_id: instanceId,
    step_number: d.step_number,
    status: (index === 0 ? "pending" : "locked") as "pending" | "locked",
  }));

  const { error } = await admin.from("item_checkpoint_instances").insert(rows);
  if (error) throw error;
}
