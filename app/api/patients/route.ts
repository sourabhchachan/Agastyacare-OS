import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/serverPermissions";

async function nextPatientNumber() {
  const year = new Date().getFullYear();
  const prefix = `IPD-${year}-`;
  const { data } = await adminClient
    .from("patients")
    .select("patient_number")
    .ilike("patient_number", `${prefix}%`)
    .order("created_at", { ascending: false })
    .limit(1);

  const last = data?.[0]?.patient_number ?? `${prefix}000`;
  const seq = Number(last.split("-").at(-1) ?? "0") + 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

export async function GET() {
  const auth = await requirePermission("manage_patients");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await adminClient
    .from("patients")
    .select("id, patient_number, name, bed_number, priority, is_active, admission_date, discharge_date")
    .order("created_at", { ascending: false });

  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ patients: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await requirePermission("manage_patients");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const body = (await req.json()) as {
    patient_number?: string;
    name?: string;
    bed_id?: string;
    priority?: "critical" | "moderate" | "stable";
    admission_date?: string;
    admitting_dept_id?: string;
  };

  const bedId = body.bed_id?.trim() ?? "";

  if (!body.name || !bedId) {
    return NextResponse.json({ error: "Name and bed selection are required" }, { status: 400 });
  }

  const { data: bed, error: bedErr } = await adminClient
    .from("beds")
    .select("id, name, is_active")
    .eq("id", bedId)
    .maybeSingle();
  if (bedErr || !bed) {
    return NextResponse.json({ error: "Invalid bed selection." }, { status: 400 });
  }
  if (!bed.is_active) {
    return NextResponse.json({ error: "This bed is not available for admission." }, { status: 400 });
  }

  const { data: occupied } = await adminClient
    .from("patients")
    .select("id")
    .eq("bed_id", bed.id)
    .eq("is_active", true)
    .maybeSingle();

  if (occupied) {
    return NextResponse.json({ error: "This bed is already occupied." }, { status: 409 });
  }

  const generated = await nextPatientNumber();
  const patientNumber = body.patient_number?.trim() || generated;

  const { data: created, error } = await adminClient
    .from("patients")
    .insert({
      patient_number: patientNumber,
      name: body.name,
      bed_id: bed.id,
      bed_number: bed.name,
      priority: body.priority ?? "stable",
      admission_date: body.admission_date ?? new Date().toISOString().slice(0, 10),
      admitted_by: user?.id ?? null,
      admitting_dept_id: body.admitting_dept_id ?? null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, id: created?.id });
}
