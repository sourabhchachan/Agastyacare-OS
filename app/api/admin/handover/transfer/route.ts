import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireHandoverAccess } from "@/lib/auth/handoverAccess";

export async function POST(req: Request) {
  const auth = await requireHandoverAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as {
    fromUserId?: string;
    toUserId?: string;
    instanceIds?: string[];
    notes?: string | null;
  };

  const fromUserId = body.fromUserId?.trim() ?? "";
  const toUserId = body.toUserId?.trim() ?? "";
  const instanceIds = Array.isArray(body.instanceIds) ? body.instanceIds.filter(Boolean) : [];
  const notes = body.notes?.trim() || null;

  if (!fromUserId || !toUserId) {
    return NextResponse.json({ error: "From and To users are required." }, { status: 400 });
  }
  if (fromUserId === toUserId) {
    return NextResponse.json({ error: "Cannot transfer tasks to the same user." }, { status: 400 });
  }
  if (instanceIds.length < 1) {
    return NextResponse.json({ error: "Select at least one task to transfer." }, { status: 400 });
  }

  const [{ data: fromUser }, { data: toUser }] = await Promise.all([
    adminClient.from("staff_users").select("id, full_name, is_active").eq("id", fromUserId).maybeSingle(),
    adminClient.from("staff_users").select("id, full_name, is_active").eq("id", toUserId).maybeSingle(),
  ]);

  if (!fromUser?.is_active || !toUser?.is_active) {
    return NextResponse.json({ error: "Both users must be active." }, { status: 400 });
  }

  const { data: rows, error: fetchErr } = await adminClient
    .from("item_instances")
    .select("id")
    .in("id", instanceIds)
    .eq("assigned_user_id", fromUserId)
    .in("status", ["pending", "in_progress"]);

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 400 });

  const validIds = new Set((rows ?? []).map((r) => r.id));
  if (validIds.size !== instanceIds.length) {
    return NextResponse.json(
      { error: "Some selected tasks are invalid, no longer pending, or not assigned to the From user." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error: updateErr } = await adminClient
    .from("item_instances")
    .update({ assigned_user_id: toUserId })
    .in("id", instanceIds)
    .eq("assigned_user_id", fromUserId)
    .in("status", ["pending", "in_progress"]);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

  const { error: logErr } = await adminClient.from("handover_log").insert({
    from_user_id: fromUserId,
    to_user_id: toUserId,
    performed_by: user?.id ?? null,
    instance_ids: instanceIds,
    item_count: instanceIds.length,
    notes,
  });
  if (logErr) {
    console.error("handover_log insert failed", logErr);
  }

  const auditRows = instanceIds.map((instanceId) => ({
    actor_user_id: user?.id ?? null,
    event: "handover",
    table_name: "item_instances",
    record_id: instanceId,
    old_data: { assigned_user_id: fromUserId },
    new_data: {
      from_user: fromUserId,
      to_user: toUserId,
      from_user_name: fromUser.full_name,
      to_user_name: toUser.full_name,
      item_instance_id: instanceId,
      notes,
      assigned_user_id: toUserId,
    },
  }));

  const { error: auditErr } = await adminClient.from("audit_logs").insert(auditRows);
  if (auditErr) {
    console.error("handover audit_logs insert failed", auditErr);
  }

  return NextResponse.json({
    ok: true,
    transferred: instanceIds.length,
    toName: toUser.full_name,
  });
}
