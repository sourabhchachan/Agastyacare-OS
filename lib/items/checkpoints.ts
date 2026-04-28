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
  if (!defs?.length) throw new Error("Catalogue item has no checkpoint definitions");

  const rows = defs.map((d) => ({
    instance_id: instanceId,
    step_number: d.step_number,
    status: "pending" as const,
  }));

  const { error } = await admin.from("item_checkpoint_instances").insert(rows);
  if (error) throw error;
}
