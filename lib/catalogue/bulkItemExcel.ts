/** Excel row keys are human-readable; match case-insensitively on header. */
export type BulkItemExcelRow = Record<string, unknown>;

export type BulkItemFailure = {
  row: number;
  itemName: string;
  reason: string;
};

function rowKeysLower(row: BulkItemExcelRow): Map<string, string> {
  const m = new Map<string, string>();
  for (const k of Object.keys(row)) {
    m.set(k.trim().toLowerCase(), k);
  }
  return m;
}

/** First non-empty match from explicit keys, then case-insensitive header match. */
export function bulkItemCell(row: BulkItemExcelRow, ...candidates: string[]): string {
  const byLower = rowKeysLower(row);
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== "") {
      return String(row[c]).trim();
    }
  }
  for (const c of candidates) {
    const actual = byLower.get(c.trim().toLowerCase());
    if (actual !== undefined) {
      const v = row[actual];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return "";
}

export function parseBulkYesNo(
  raw: string,
  whenEmpty: boolean,
  columnLabel: string
): { ok: true; value: boolean } | { ok: false; reason: string } {
  const t = raw.trim().toLowerCase();
  if (!t) return { ok: true, value: whenEmpty };
  if (t === "yes" || t === "true" || t === "1") return { ok: true, value: true };
  if (t === "no" || t === "false" || t === "0") return { ok: true, value: false };
  return { ok: false, reason: `Invalid ${columnLabel} (use yes/no, true/false, or 1/0): ${raw}` };
}

export function buildNameLookupMap<T extends { id: string; name: string }>(
  rows: T[]
): Map<string, { id: string; original: string }> {
  return new Map(
    rows.map((r) => {
      const original = r.name.trim();
      return [original.toLowerCase(), { id: r.id, original }] as const;
    })
  );
}

export function resolveDeptByName(
  map: Map<string, { id: string; original: string }>,
  cell: string
): { id: string } | null | { error: string } {
  const t = cell.trim();
  if (!t) return null;
  const hit = map.get(t.toLowerCase());
  if (!hit) return { error: `Department not found: ${t}` };
  return { id: hit.id };
}

export function resolveVendorByName(
  map: Map<string, { id: string; original: string }>,
  cell: string
): { id: string } | null | { error: string } {
  const t = cell.trim();
  if (!t) return null;
  const hit = map.get(t.toLowerCase());
  if (!hit) return { error: `Vendor not found: ${t}` };
  return { id: hit.id };
}

export function parseOptionalUnitCost(raw: string): { ok: true; value: number } | { ok: false; reason: string } {
  const t = raw.trim();
  if (!t) return { ok: true, value: 0 };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, reason: `Invalid unit cost: ${raw}` };
  }
  return { ok: true, value: n };
}

export type PreparedBulkCatalogueItem = {
  name: string;
  is_active: boolean;
  requires_patient: boolean;
  ordering_dept_id: string | null;
  dispatching_dept_id: string | null;
  vendor_id: string | null;
  billing_flag: boolean;
  unit_cost: number;
  sop_id: null;
};

/**
 * Validates one Excel row for catalogue bulk import (no DB writes).
 * `existingNamesLower` = names already in `item_catalogue` (trimmed lower).
 * `batchNamesLower` = names accepted earlier in the same file/run (caller mutates on success).
 */
export function prepareBulkCatalogueItemRow(
  row: BulkItemExcelRow,
  excelRow: number,
  deptMap: Map<string, { id: string; original: string }>,
  vendorMap: Map<string, { id: string; original: string }>,
  existingNamesLower: Set<string>,
  batchNamesLower: Set<string>
): { ok: true; prepared: PreparedBulkCatalogueItem } | { ok: false; failure: BulkItemFailure } {
  const name = bulkItemCell(row, "Name", "name");
  const itemLabel = name.trim() || "(unnamed)";

  if (!name.trim()) {
    return {
      ok: false,
      failure: { row: excelRow, itemName: itemLabel, reason: "Name is required" },
    };
  }

  const nameKey = name.trim().toLowerCase();
  if (existingNamesLower.has(nameKey) || batchNamesLower.has(nameKey)) {
    return {
      ok: false,
      failure: { row: excelRow, itemName: name.trim(), reason: `Duplicate item: ${name.trim()}` },
    };
  }

  const requiresRaw = bulkItemCell(row, "Requires Patient", "Requires patient", "requires patient");
  const requiresParsed = parseBulkYesNo(requiresRaw, true, "Requires Patient");
  if (!requiresParsed.ok) {
    return {
      ok: false,
      failure: { row: excelRow, itemName: name.trim(), reason: requiresParsed.reason },
    };
  }

  const orderingRaw = bulkItemCell(
    row,
    "Ordering Department",
    "Ordering department",
    "Ordering Dept",
    "Ordering dept"
  );
  const orderingRes = resolveDeptByName(deptMap, orderingRaw);
  if (orderingRes && "error" in orderingRes) {
    return {
      ok: false,
      failure: { row: excelRow, itemName: name.trim(), reason: orderingRes.error },
    };
  }
  const ordering_dept_id = orderingRes && "id" in orderingRes ? orderingRes.id : null;

  const dispatchRaw = bulkItemCell(
    row,
    "Dispatching Department",
    "Dispatching department",
    "Dispatching Dept",
    "Dispatching dept"
  );
  const dispatchRes = resolveDeptByName(deptMap, dispatchRaw);
  if (dispatchRes && "error" in dispatchRes) {
    return {
      ok: false,
      failure: { row: excelRow, itemName: name.trim(), reason: dispatchRes.error },
    };
  }
  const dispatching_dept_id = dispatchRes && "id" in dispatchRes ? dispatchRes.id : null;

  const vendorRaw = bulkItemCell(row, "Vendor", "vendor");
  const vendorRes = resolveVendorByName(vendorMap, vendorRaw);
  if (vendorRes && "error" in vendorRes) {
    return {
      ok: false,
      failure: { row: excelRow, itemName: name.trim(), reason: vendorRes.error },
    };
  }
  const vendor_id = vendorRes && "id" in vendorRes ? vendorRes.id : null;

  const billingRaw = bulkItemCell(row, "Billing", "billing");
  const billingParsed = parseBulkYesNo(billingRaw, false, "Billing");
  if (!billingParsed.ok) {
    return {
      ok: false,
      failure: { row: excelRow, itemName: name.trim(), reason: billingParsed.reason },
    };
  }

  const unitRaw = bulkItemCell(row, "Unit Cost", "Unit cost", "unit cost");
  const unitParsed = parseOptionalUnitCost(unitRaw);
  if (!unitParsed.ok) {
    return {
      ok: false,
      failure: { row: excelRow, itemName: name.trim(), reason: unitParsed.reason },
    };
  }

  const billing_flag = billingParsed.value;
  const unit_cost = billing_flag ? unitParsed.value : 0;

  return {
    ok: true,
    prepared: {
      name: name.trim(),
      is_active: true,
      requires_patient: requiresParsed.value,
      ordering_dept_id,
      dispatching_dept_id,
      vendor_id,
      billing_flag,
      unit_cost,
      sop_id: null,
    },
  };
}
