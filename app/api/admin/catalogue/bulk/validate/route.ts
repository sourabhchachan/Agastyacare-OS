import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";
import {
  buildNameLookupMap,
  prepareBulkCatalogueItemRow,
  type BulkItemExcelRow,
  type BulkItemFailure,
} from "@/lib/catalogue/bulkItemExcel";

/** Dry-run validation (no inserts). Same rules as bulk import. */
export async function POST(req: Request) {
  const auth = await requirePermission("build_system");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as { rows?: BulkItemExcelRow[] };
  const rows = body.rows ?? [];

  const [{ data: departments }, { data: vendors }, { data: existingItems }] = await Promise.all([
    adminClient.from("departments").select("id, name").eq("is_active", true),
    adminClient.from("vendors").select("id, name"),
    adminClient.from("item_catalogue").select("name"),
  ]);

  const deptMap = buildNameLookupMap(departments ?? []);
  const vendorMap = buildNameLookupMap(vendors ?? []);
  const existingNamesLower = new Set(
    (existingItems ?? []).map((item) => item.name.trim().toLowerCase()).filter(Boolean)
  );
  const batchNamesLower = new Set<string>();

  const failures: BulkItemFailure[] = [];

  for (let i = 0; i < rows.length; i++) {
    const excelRow = i + 2;
    const result = prepareBulkCatalogueItemRow(
      rows[i],
      excelRow,
      deptMap,
      vendorMap,
      existingNamesLower,
      batchNamesLower
    );

    if (!result.ok) {
      failures.push(result.failure);
      continue;
    }

    batchNamesLower.add(result.prepared.name.trim().toLowerCase());
  }

  return NextResponse.json({
    ok: failures.length === 0,
    failedCount: failures.length,
    failures,
  });
}
