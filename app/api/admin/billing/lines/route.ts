import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/serverPermissions";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { adminClient } from "@/lib/supabase/admin";
import { lineCost, orderDateToDdMmYy } from "@/lib/billing/formatting";

export const dynamic = "force-dynamic";

type LineRow = {
  id: string;
  patient_id: string | null;
  instance_id: string;
  catalogue_item_id: string;
  quantity: number;
  unit_cost_at_order: string | number;
  ordered_by: string | null;
  order_date: string;
  order_time: string;
  dispatched_by: string | null;
  dispatch_date: string | null;
  dispatch_time: string | null;
  received_by: string | null;
  receive_date: string | null;
  receive_time: string | null;
  status: string;
  cancellation_remarks: string | null;
  patients: { patient_number: string; name: string } | { patient_number: string; name: string }[] | null;
  item_catalogue: { name: string } | { name: string }[] | null;
};

function oneRel<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

function pickName(map: Map<string, string>, id: string | null) {
  if (!id) return "";
  return map.get(id) ?? "";
}

export async function GET(req: Request) {
  const gate = await requirePermission(PERMISSIONS.ACCESS_FINANCIAL_DATA);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const statusF = url.searchParams.get("status");

  let q = adminClient
    .from("bill_lines")
    .select(
      `
    id, patient_id, instance_id, catalogue_item_id, quantity, unit_cost_at_order,
    ordered_by, order_date, order_time,
    dispatched_by, dispatch_date, dispatch_time,
    received_by, receive_date, receive_time,
    status, cancellation_remarks,
    patients(patient_number, name),
    item_catalogue(name)
  `
    )
    .order("order_date", { ascending: false });

  if (patientId) {
    q = q.eq("patient_id", patientId);
  }
  if (from) {
    q = q.gte("order_date", from);
  }
  if (to) {
    q = q.lte("order_date", to);
  }
  if (statusF) {
    q = q.eq("status", statusF);
  }
  const { data, error: e1 } = await q;
  if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 400 });
  }

  let patientWhenFiltered: { patient_number: string; name: string } | null = null;
  if (patientId) {
    const { data: pat, error: pe } = await adminClient
      .from("patients")
      .select("patient_number, name")
      .eq("id", patientId)
      .maybeSingle();
    if (!pe && pat) {
      patientWhenFiltered = {
        patient_number: (pat as { patient_number: string }).patient_number,
        name: (pat as { name: string }).name,
      };
    }
  }

  const rows = (data ?? []) as unknown as LineRow[];
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.ordered_by) ids.add(r.ordered_by);
    if (r.dispatched_by) ids.add(r.dispatched_by);
    if (r.received_by) ids.add(r.received_by);
  }
  const idList = Array.from(ids);
  const nameMap = new Map<string, string>();
  if (idList.length > 0) {
    const { data: staff, error: e2 } = await adminClient
      .from("staff_users")
      .select("id, full_name")
      .in("id", idList);
    if (e2) {
      return NextResponse.json({ error: e2.message }, { status: 400 });
    }
    for (const s of staff ?? []) {
      const row = s as { id: string; full_name: string };
      nameMap.set(row.id, row.full_name);
    }
  }

  const lines = rows.map((r) => {
    const p = oneRel(r.patients);
    const ic = oneRel(r.item_catalogue);
    const qn = r.quantity ?? 1;
    const u = Number(r.unit_cost_at_order);
    return {
      id: r.id,
      patient_number: p?.patient_number ?? "—",
      patient_name: p?.name ?? "",
      item_name: ic?.name ?? "—",
      quantity: qn,
      unit_cost: u,
      total_cost: lineCost(qn, u),
      ordered_by_name: pickName(nameMap, r.ordered_by),
      order_date: r.order_date,
      order_time: r.order_time,
      order_date_formatted: orderDateToDdMmYy(r.order_date),
      dispatch_date_formatted: orderDateToDdMmYy(r.dispatch_date),
      receive_date_formatted: orderDateToDdMmYy(r.receive_date),
      dispatched_by_name: pickName(nameMap, r.dispatched_by),
      dispatch_date: r.dispatch_date,
      dispatch_time: r.dispatch_time ?? "",
      received_by_name: pickName(nameMap, r.received_by),
      receive_date: r.receive_date,
      receive_time: r.receive_time ?? "",
      status: r.status,
      cancellation_remarks: r.cancellation_remarks ?? "",
    };
  });

  return NextResponse.json({ lines, patient: patientWhenFiltered });
}
