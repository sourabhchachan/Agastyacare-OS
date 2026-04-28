import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/serverPermissions";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("update_patient_priority");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as { priority?: "critical" | "moderate" | "stable" };
  if (!body.priority) return NextResponse.json({ error: "Priority is required" }, { status: 400 });

  const { error } = await adminClient.from("patients").update({ priority: body.priority }).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await adminClient.from("audit_logs").insert({
    actor_user_id: user?.id ?? null,
    event: "patient_priority_updated",
    table_name: "patients",
    record_id: params.id,
    new_data: { priority: body.priority, hhmm: new Date().toTimeString().slice(0, 5) },
  });

  return NextResponse.json({ ok: true });
}
