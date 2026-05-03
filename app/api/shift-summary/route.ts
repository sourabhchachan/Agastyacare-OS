import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  canUserActOnCurrentCheckpoint,
  isCheckpointAssignmentAdmin,
} from "@/lib/items/checkpointAccess";

function startOfShiftIso() {
  const d = new Date();
  d.setHours(8, 0, 0, 0);
  if (Date.now() < d.getTime()) d.setDate(d.getDate() - 1);
  return d.toISOString();
}

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = startOfShiftIso();
  const isAdmin = await isCheckpointAssignmentAdmin(adminClient, user.id);

  const [completedRes, overdueCandidatesRes, terminalRes, passedRes] = await Promise.all([
    adminClient
      .from("item_checkpoint_instances")
      .select("instance_id, step_number, actioned_time, actioned_date")
      .eq("actor_user_id", user.id)
      .eq("status", "completed")
      .gte("created_at", since),
    adminClient
      .from("item_instances")
      .select("id, due_at, remarks, assigned_user_id, created_by")
      .in("status", ["pending", "in_progress"])
      .lt("due_at", new Date().toISOString()),
    adminClient
      .from("item_instances")
      .select("id, status, remarks, completed_at")
      .eq("assigned_user_id", user.id)
      .in("status", ["cancelled", "not_done"])
      .gte("completed_at", since),
    adminClient
      .from("audit_logs")
      .select("id, created_at, old_data, new_data")
      .eq("table_name", "item_instances")
      .gte("created_at", since),
  ]);

  if (completedRes.error || overdueCandidatesRes.error || terminalRes.error || passedRes.error) {
    const msg =
      completedRes.error?.message ||
      overdueCandidatesRes.error?.message ||
      terminalRes.error?.message ||
      passedRes.error?.message ||
      "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const completed = (completedRes.data ?? []).map((r) => ({
    instance_id: r.instance_id,
    step_number: r.step_number,
    time: r.actioned_time ?? "",
    date: r.actioned_date ?? "",
  }));
  const overdueRows: Array<{ id: string; due_at: string; assigned_user_id: string; created_by: string | null }> =
    overdueCandidatesRes.data ?? [];
  const overdueFiltered: typeof overdueRows = [];
  for (const r of overdueRows) {
    if (
      isAdmin ||
      r.assigned_user_id === user.id ||
      r.created_by === user.id ||
      (await canUserActOnCurrentCheckpoint(adminClient, user.id, r.id, false))
    ) {
      overdueFiltered.push(r);
    }
  }
  const overdue = overdueFiltered.map((r) => ({
    id: r.id,
    due_at: r.due_at,
  }));
  const terminal = (terminalRes.data ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    remarks: r.remarks ?? "",
    completed_at: r.completed_at ?? "",
  }));

  const passedOn = (passedRes.data ?? []).filter((r) => {
    const oldAssigned = (r.old_data as { assigned_user_id?: string } | null)?.assigned_user_id;
    const newAssigned = (r.new_data as { assigned_user_id?: string } | null)?.assigned_user_id;
    return !!oldAssigned && !!newAssigned && oldAssigned === user.id && newAssigned !== user.id;
  });

  return NextResponse.json({
    completed,
    overdue,
    cancelledNotDone: terminal,
    passedOn: passedOn.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      old_assigned: (r.old_data as { assigned_user_id?: string } | null)?.assigned_user_id ?? null,
      new_assigned: (r.new_data as { assigned_user_id?: string } | null)?.assigned_user_id ?? null,
    })),
  });
}
