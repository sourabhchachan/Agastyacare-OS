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

  const [{ data: departments }, { data: vendors }, { data: sops }, { data: existing }] = await Promise.all([
    adminClient.from("departments").select("id, name"),
    adminClient.from("vendors").select("id, name"),
    adminClient.from("sop").select("id, title"),
    adminClient.from("item_catalogue").select("name"),
  ]);

  const deptByName = new Map((departments ?? []).map((d) => [d.name.toLowerCase(), d.id]));
  const vendorByName = new Map((vendors ?? []).map((v) => [v.name.toLowerCase(), v.id]));
  const sopByTitle = new Map((sops ?? []).map((s) => [s.title.toLowerCase(), s.id]));
  const existingNames = new Set((existing ?? []).map((item) => item.name.toLowerCase()));

  const allowedTypes = new Set(["recurring", "triggered", "facility"]);
  const errors: Array<{ row: number; errors: string[] }> = [];

  rows.forEach((row, index) => {
    const rowErrors: string[] = [];
    const name = String(row.Name ?? "").trim();
    const type = String(row.Type ?? "").trim().toLowerCase();
    const orderingDept = String(row["Ordering Dept"] ?? "").trim().toLowerCase();
    const dispatchingDept = String(row["Dispatching Dept"] ?? "").trim().toLowerCase();
    const vendor = String(row.Vendor ?? "").trim().toLowerCase();
    const sopTitle = String(row["Solution Title"] ?? row["SOP Title"] ?? "").trim().toLowerCase();

    if (!name) rowErrors.push("Name is required");
    if (name && existingNames.has(name.toLowerCase())) rowErrors.push("Duplicate name already exists");
    if (!allowedTypes.has(type)) rowErrors.push("Type must be recurring/triggered/facility");
    if (orderingDept && !deptByName.has(orderingDept)) rowErrors.push("Ordering Dept not found");
    if (dispatchingDept && !deptByName.has(dispatchingDept)) rowErrors.push("Dispatching Dept not found");
    if (vendor && !vendorByName.has(vendor)) rowErrors.push("Vendor not found");
    if (sopTitle && !sopByTitle.has(sopTitle)) rowErrors.push("Solution Title not found");

    if (rowErrors.length > 0) {
      errors.push({ row: index + 2, errors: rowErrors });
    }
  });

  return NextResponse.json({ ok: errors.length === 0, errors });
}
