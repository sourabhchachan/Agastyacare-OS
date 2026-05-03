import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/serverPermissions";

export async function PATCH(_: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("manage_patients");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await adminClient
    .from("patients")
    .update({ is_active: false, discharge_date: today, bed_id: null })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const now = new Date().toISOString();
  await adminClient
    .from("item_instances")
    .update({
      status: "cancelled",
      completed_at: now,
      remarks: "Patient discharged",
    })
    .eq("patient_id", params.id)
    .in("status", ["pending", "in_progress"]);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await adminClient.from("audit_logs").insert({
    actor_user_id: user?.id ?? null,
    event: "patient_discharged",
    table_name: "patients",
    record_id: params.id,
    new_data: { discharge_date: today, hhmm: new Date().toTimeString().slice(0, 5) },
  });

  return NextResponse.json({ ok: true });
}
