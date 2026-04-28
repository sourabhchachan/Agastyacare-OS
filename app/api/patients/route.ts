import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/serverPermissions";
import { createRecurringItemInstancesOnAdmit } from "@/lib/items/createItemInstances";

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
    bed_number?: string;
    priority?: "critical" | "moderate" | "stable";
    admission_date?: string;
    admitting_dept_id?: string;
  };

  if (!body.name || !body.bed_number) {
    return NextResponse.json({ error: "Name and bed number are required" }, { status: 400 });
  }

  const generated = await nextPatientNumber();
  const patientNumber = body.patient_number?.trim() || generated;

  const { data: created, error } = await adminClient
    .from("patients")
    .insert({
      patient_number: patientNumber,
      name: body.name,
      bed_number: body.bed_number,
      priority: body.priority ?? "stable",
      admission_date: body.admission_date ?? new Date().toISOString().slice(0, 10),
      admitted_by: user?.id ?? null,
      admitting_dept_id: body.admitting_dept_id ?? null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (created?.id && body.admitting_dept_id) {
    try {
      await createRecurringItemInstancesOnAdmit(adminClient, {
        patientId: created.id,
        bedNumber: body.bed_number,
        admittingDeptId: body.admitting_dept_id,
        createdBy: user?.id ?? null,
      });
    } catch (e) {
      console.error("recurring items on admit", e);
    }
  }

  return NextResponse.json({ ok: true, id: created?.id });
}
