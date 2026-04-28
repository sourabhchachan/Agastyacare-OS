import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/serverPermissions";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { adminClient } from "@/lib/supabase/admin";
import {
  endOfIsoWeekYmd,
  firstDayOfIsoWeekYmd,
  firstDayOfMonthYmd,
  lineContributesToRunningCost,
  lineCost,
  lastDayOfMonthYmd,
  todayYmd,
} from "@/lib/billing/formatting";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requirePermission(PERMISSIONS.ACCESS_FINANCIAL_DATA);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { data: rows, error: e1 } = await adminClient
    .from("bill_lines")
    .select("order_date, quantity, unit_cost_at_order, status");
  if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 400 });
  }

  const today = todayYmd();
  const w0 = firstDayOfIsoWeekYmd();
  const w1 = endOfIsoWeekYmd();
  const m0 = firstDayOfMonthYmd();
  const m1 = lastDayOfMonthYmd();

  const sumFor = (pred: (orderDate: string, st: string) => boolean) => {
    let s = 0;
    for (const r of rows ?? []) {
      if (!r.order_date || !lineContributesToRunningCost(r.status as string)) continue;
      if (!pred(r.order_date, r.status as string)) continue;
      s += lineCost(
        (r as { quantity: number }).quantity ?? 1,
        Number((r as { unit_cost_at_order: string }).unit_cost_at_order)
      );
    }
    return Math.round(s * 100) / 100;
  };

  const inRange = (d: string, a: string, b: string) => d >= a && d <= b;

  const totalToday = sumFor((d) => d === today);
  const totalWeek = sumFor((d) => inRange(d, w0, w1));
  const totalMonth = sumFor((d) => inRange(d, m0, m1));

  const { count, error: e2 } = await adminClient
    .from("patients")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  if (e2) {
    return NextResponse.json({ error: e2.message }, { status: 400 });
  }

  return NextResponse.json({
    totalToday,
    totalThisWeek: totalWeek,
    totalThisMonth: totalMonth,
    activePatientCount: count ?? 0,
  });
}
