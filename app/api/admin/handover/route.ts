import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/serverPermissions";

export async function GET() {
  const auth = await requirePermission("manage_users");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data: outgoing }, { data: incoming }, { data: assignments }] = await Promise.all([
    adminClient.from("staff_users").select("id, full_name, is_active").eq("is_active", true).order("full_name"),
    adminClient.from("staff_users").select("id, full_name, is_active").eq("is_active", false).order("full_name"),
    adminClient.from("bed_assignments").select("id, dept_id, assigned_user_id, bed_range_start, bed_range_end"),
  ]);

  return NextResponse.json({ outgoing: outgoing ?? [], incoming: incoming ?? [], assignments: assignments ?? [] });
}

export async function POST(req: Request) {
  const auth = await requirePermission("manage_users");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as {
    outgoingUserIds?: string[];
    incomingUserIds?: string[];
  };

  const outgoingUserIds = body.outgoingUserIds ?? [];
  const incomingUserIds = body.incomingUserIds ?? [];

  if (outgoingUserIds.length < 1 || incomingUserIds.length < 1) {
    return NextResponse.json({ error: "Cannot deactivate without replacement" }, { status: 400 });
  }

  const primaryIncoming = incomingUserIds[0]!;
  for (const outId of outgoingUserIds) {
    await adminClient
      .from("item_instances")
      .update({ assigned_user_id: primaryIncoming })
      .eq("assigned_user_id", outId)
      .in("status", ["pending", "in_progress"]);
  }

  const { error: deactivateError } = await adminClient.from("staff_users").update({ is_active: false }).in("id", outgoingUserIds);
  if (deactivateError) return NextResponse.json({ error: deactivateError.message }, { status: 400 });

  const { error: activateError } = await adminClient.from("staff_users").update({ is_active: true }).in("id", incomingUserIds);
  if (activateError) return NextResponse.json({ error: activateError.message }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await adminClient.from("audit_logs").insert({
    actor_user_id: user?.id ?? null,
    event: "shift_handover_completed",
    table_name: "staff_users",
    record_id: `handover:${Date.now()}`,
    new_data: {
      outgoingUserIds,
      incomingUserIds,
      itemReassignTo: primaryIncoming,
      hhmm: new Date().toTimeString().slice(0, 5),
    },
  });

  return NextResponse.json({ ok: true, redirectTo: "/admin/bed-assignments" });
}
