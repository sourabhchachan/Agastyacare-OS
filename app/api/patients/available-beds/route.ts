import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";

/** Beds that are active and not assigned to an active patient. */
export async function GET() {
  const auth = await requirePermission("manage_patients");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: beds, error: bErr } = await adminClient
    .from("beds")
    .select("id, name, ward")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 400 });

  const { data: taken, error: tErr } = await adminClient
    .from("patients")
    .select("bed_id")
    .eq("is_active", true)
    .not("bed_id", "is", null);
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 });

  const takenSet = new Set((taken ?? []).map((r) => r.bed_id).filter(Boolean) as string[]);
  const available = (beds ?? []).filter((bed) => !takenSet.has(bed.id));

  return NextResponse.json({ beds: available });
}
