import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";

type BulkItemRow = {
  Name?: string;
  Type?: string;
  Frequency?: string;
  "Solution Title"?: string;
  "SOP Title"?: string;
  "Ordering Dept"?: string;
  "Dispatching Dept"?: string;
  Vendor?: string;
  Billing?: string;
  "Unit Cost"?: string | number;
  Category?: string;
};

export async function POST(req: Request) {
  const auth = await requirePermission("build_system");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as { rows?: BulkItemRow[] };
  const rows = body.rows ?? [];

  const [{ data: departments }, { data: vendors }, { data: sops }] = await Promise.all([
    adminClient.from("departments").select("id, name"),
    adminClient.from("vendors").select("id, name"),
    adminClient.from("sop").select("id, title"),
  ]);

  const deptByName = new Map((departments ?? []).map((d) => [d.name.toLowerCase(), d.id]));
  const vendorByName = new Map((vendors ?? []).map((v) => [v.name.toLowerCase(), v.id]));
  const sopByTitle = new Map((sops ?? []).map((s) => [s.title.toLowerCase(), s.id]));

  const payload = rows.map((row) => {
    const billing = String(row.Billing ?? "").trim().toLowerCase();

    return {
      name: String(row.Name ?? "").trim(),
      type: String(row.Type ?? "").trim().toLowerCase(),
      frequency: String(row.Frequency ?? "once").trim(),
      sop_id: sopByTitle.get(String(row["Solution Title"] ?? row["SOP Title"] ?? "").trim().toLowerCase()) ?? null,
      ordering_dept_id: deptByName.get(String(row["Ordering Dept"] ?? "").trim().toLowerCase()) ?? null,
      dispatching_dept_id: deptByName.get(String(row["Dispatching Dept"] ?? "").trim().toLowerCase()) ?? null,
      vendor_id: vendorByName.get(String(row.Vendor ?? "").trim().toLowerCase()) ?? null,
      billing_flag: billing === "yes" || billing === "true",
      unit_cost: Number(row["Unit Cost"] ?? 0),
      category: String(row.Category ?? "").trim() || null,
    };
  });

  const { error } = await adminClient.from("item_catalogue").insert(payload);
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ ok: true });
}
