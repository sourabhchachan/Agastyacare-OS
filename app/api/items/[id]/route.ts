import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { canUserViewItemInstance, isCheckpointAssignmentAdmin } from "@/lib/items/checkpointAccess";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: inst, error: e1 } = await adminClient
    .from("item_instances")
    .select(
      "id, status, due_at, remarks, patient_id, catalogue_item_id, assigned_user_id, created_by, catalogue_type"
    )
    .eq("id", params.id)
    .single();
  if (e1 || !inst) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = await isCheckpointAssignmentAdmin(adminClient, user.id);
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
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: cat } = await adminClient
    .from("item_catalogue")
    .select("name")
    .eq("id", inst.catalogue_item_id)
    .single();

  const { data: pat } = inst.patient_id
    ? await adminClient
        .from("patients")
        .select("name, bed_number, priority")
        .eq("id", inst.patient_id)
        .single()
    : { data: null };

  const { data: cps, error: e2 } = await adminClient
    .from("item_checkpoint_instances")
    .select("id, step_number, status, actor_user_id, actioned_date, actioned_time, proof_note")
    .eq("instance_id", params.id)
    .order("step_number", { ascending: true });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });

  let rows = cps ?? [];
  if (!isAdmin) {
    rows = rows.filter((c) => c.status !== "locked");
  }

  const actorIds = Array.from(new Set(rows.map((c) => c.actor_user_id).filter(Boolean))) as string[];
  const { data: actors } =
    actorIds.length > 0
      ? await adminClient.from("staff_users").select("id, full_name").in("id", actorIds)
      : { data: [] };
  const nameBy = new Map((actors ?? []).map((a) => [a.id, a.full_name]));

  const cpsWithNames = rows.map((c) => ({
    ...c,
    actor_name: c.actor_user_id ? nameBy.get(c.actor_user_id) ?? null : null,
  }));

  const { data: defs, error: e3 } = await adminClient
    .from("item_checkpoint_definitions")
    .select("step_number, description, dept_id, assignment_type, assigned_user_id")
    .eq("catalogue_item_id", inst.catalogue_item_id)
    .order("step_number", { ascending: true });
  if (e3) return NextResponse.json({ error: e3.message }, { status: 400 });

  return NextResponse.json({
    instance: { ...inst, item_name: cat?.name ?? "Item" },
    patient: pat,
    checkpoints: cpsWithNames,
    definitions: defs ?? [],
  });
}
