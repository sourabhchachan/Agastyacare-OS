import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/serverPermissions";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { adminClient } from "@/lib/supabase/admin";
import { lineContributesToRunningCost, lineCost } from "@/lib/billing/formatting";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requirePermission(PERMISSIONS.ACCESS_FINANCIAL_DATA);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { data: patients, error: e1 } = await adminClient
    .from("patients")
    .select("id, patient_number, name, is_active")
    .eq("is_active", true)
    .order("patient_number", { ascending: true });
  if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 400 });
  }

  const { data: lines, error: e2 } = await adminClient
    .from("bill_lines")
    .select("patient_id, quantity, unit_cost_at_order, status");
  if (e2) {
    return NextResponse.json({ error: e2.message }, { status: 400 });
  }

  const sumBy = new Map<string, number>();
  for (const row of lines ?? []) {
    const r = row as { patient_id: string | null; status: string; quantity: number; unit_cost_at_order: string | number };
    if (!r.patient_id) continue;
    if (!lineContributesToRunningCost(r.status)) continue;
    const v = lineCost(
      r.quantity ?? 1,
      typeof r.unit_cost_at_order === "string"
        ? Number(r.unit_cost_at_order)
        : r.unit_cost_at_order
    );
    sumBy.set(r.patient_id, (sumBy.get(r.patient_id) ?? 0) + v);
  }

  const out = (patients ?? []).map((p) => {
    const id = (p as { id: string }).id;
    return {
      id,
      patient_number: (p as { patient_number: string }).patient_number,
      name: (p as { name: string }).name,
      runningTotal: Math.round((sumBy.get(id) ?? 0) * 100) / 100,
    };
  });

  return NextResponse.json({ patients: out });
}
