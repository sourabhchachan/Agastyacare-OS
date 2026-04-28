"use client";

import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";
import { CanDo } from "@/components/CanDo";
import { PERMISSIONS } from "@/lib/auth/permissions";

type Department = { id: string; name: string };
type Vendor = { id: string; name: string };
type SOPOption = { id: string; title: string; kpi?: { title?: string; kra?: { title?: string } } };
type Item = {
  id: string;
  name: string;
  type: "recurring" | "triggered" | "facility";
  frequency: string;
  frequency_time: string | null;
  frequency_day: string | null;
  ordering_dept_id: string | null;
  dispatching_dept_id: string | null;
  vendor_id: string | null;
  billing_flag: boolean;
  unit_cost: number;
  category: string | null;
  sop_id: string | null;
};
type Checkpoint = { id?: string; catalogue_item_id?: string; step_number?: number; dept_id: string; description: string };

const CATEGORY_SUGGESTIONS = ["Pharmacy", "Lab", "Food", "Linen", "Procedure", "Facility", "Clinical"];

export default function CataloguePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [sops, setSops] = useState<SOPOption[]>([]);
  const [checkpointsMap, setCheckpointsMap] = useState<Record<string, Checkpoint[]>>({});

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [bulkErrors, setBulkErrors] = useState<Array<{ row: number; errors: string[] }>>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "recurring",
    frequency: "once",
    frequency_time: "",
    frequency_day: "",
    sop_id: "",
    ordering_dept_id: "",
    dispatching_dept_id: "",
    vendor_id: "",
    billing_flag: false,
    unit_cost: "0",
    category: "",
  });
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([{ dept_id: "", description: "" }]);

  const loadData = async () => {
    const response = await fetch("/api/admin/catalogue");
    const result = (await response.json()) as {
      items: Item[];
      departments: Department[];
      vendors: Vendor[];
      sops: SOPOption[];
      checkpoints: Array<Checkpoint & { catalogue_item_id: string }>;
    };

    setItems(result.items ?? []);
    setDepartments(result.departments ?? []);
    setVendors(result.vendors ?? []);
    setSops(result.sops ?? []);

    const map: Record<string, Checkpoint[]> = {};
    (result.checkpoints ?? []).forEach((checkpoint) => {
      const key = checkpoint.catalogue_item_id;
      if (!map[key]) map[key] = [];
      map[key].push({ dept_id: checkpoint.dept_id, description: checkpoint.description, step_number: checkpoint.step_number, id: checkpoint.id });
    });
    setCheckpointsMap(map);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
      const matchType = typeFilter === "all" || item.type === typeFilter;
      const matchCategory = categoryFilter === "all" || (item.category ?? "").toLowerCase() === categoryFilter.toLowerCase();
      return matchSearch && matchType && matchCategory;
    });
  }, [items, search, typeFilter, categoryFilter]);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: "",
      type: "recurring",
      frequency: "once",
      frequency_time: "",
      frequency_day: "",
      sop_id: "",
      ordering_dept_id: "",
      dispatching_dept_id: "",
      vendor_id: "",
      billing_flag: false,
      unit_cost: "0",
      category: "",
    });
    setCheckpoints([{ dept_id: "", description: "" }]);
    setNameError(null);
  };

  const checkName = async (name: string, excludeId?: string) => {
    const response = await fetch("/api/admin/catalogue/check-name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, excludeId }),
    });
    const result = (await response.json()) as { exists: boolean };
    setNameError(result.exists ? "Item already exists" : null);
  };

  const saveItem = async () => {
    setSaveMessage(null);
    if (!form.name.trim()) {
      setSaveMessage({ type: "err", text: "Please enter an item name." });
      return;
    }
    if (nameError) {
      setSaveMessage({ type: "err", text: "Resolve the duplicate name before saving." });
      return;
    }
    if (checkpoints.length < 1) {
      setSaveMessage({ type: "err", text: "Add at least one checkpoint." });
      return;
    }
    const badCheckpoint = checkpoints.findIndex(
      (step) => !step.dept_id || !step.description.trim()
    );
    if (badCheckpoint >= 0) {
      setSaveMessage({
        type: "err",
        text: `Checkpoint ${badCheckpoint + 1}: choose a department and enter a description.`,
      });
      return;
    }

    const payload = {
      ...form,
      name: form.name.trim(),
      type: form.type,
      frequency: form.frequency,
      frequency_time: form.frequency_time || null,
      frequency_day: form.frequency_day || null,
      sop_id: form.sop_id || null,
      ordering_dept_id: form.ordering_dept_id || null,
      dispatching_dept_id: form.dispatching_dept_id || null,
      vendor_id: form.vendor_id || null,
      unit_cost: form.billing_flag ? Number(form.unit_cost || 0) : 0,
      billing_flag: form.billing_flag,
      checkpoints,
    };

    const response = await fetch("/api/admin/catalogue", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
    });
    const result = (await response.json()) as { ok?: boolean; error?: string };

    if (!response.ok) {
      setSaveMessage({ type: "err", text: result.error ?? "Could not save. Try again." });
      return;
    }

    resetForm();
    setSaveMessage({ type: "ok", text: editingId ? "Item updated." : "Item created." });
    await loadData();
  };

  const editItem = (item: Item) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      type: item.type,
      frequency: item.frequency,
      frequency_time: item.frequency_time ?? "",
      frequency_day: item.frequency_day ?? "",
      sop_id: item.sop_id ?? "",
      ordering_dept_id: item.ordering_dept_id ?? "",
      dispatching_dept_id: item.dispatching_dept_id ?? "",
      vendor_id: item.vendor_id ?? "",
      billing_flag: item.billing_flag,
      unit_cost: String(item.unit_cost ?? 0),
      category: item.category ?? "",
    });
    setCheckpoints((checkpointsMap[item.id] ?? []).map((step) => ({ dept_id: step.dept_id, description: step.description }))); 
    setNameError(null);
  };

  const moveStep = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= checkpoints.length) return;
    const next = [...checkpoints];
    const temp = next[index];
    next[index] = next[target];
    next[target] = temp;
    setCheckpoints(next);
  };

  const downloadTemplate = () => {
    const worksheet = XLSX.utils.json_to_sheet([
      { Name: "", Type: "", Frequency: "", "Solution Title": "", "Ordering Dept": "", "Dispatching Dept": "", Vendor: "", Billing: "", "Unit Cost": "", Category: "" },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "ItemCatalogueTemplate");
    XLSX.writeFile(workbook, "agastya-item-catalogue-template.xlsx");
  };

  const handleBulkUpload = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

    const response = await fetch("/api/admin/catalogue/bulk/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const result = (await response.json()) as { ok: boolean; errors: Array<{ row: number; errors: string[] }> };

    if (!result.ok) {
      setBulkErrors(result.errors);
      return;
    }

    setBulkErrors([]);
    await fetch("/api/admin/catalogue/bulk/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });

    await loadData();
  };

  return (
    <CanDo permission={PERMISSIONS.BUILD_SYSTEM} fallback={<p className="text-sm text-slate-600">No access.</p>}>
      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-[#1B4F8A]">Admin - Item Catalogue</h1>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <h2 className="text-sm font-semibold">Search & Filters</h2>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by item name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
              <option value="all">All types</option>
              <option value="recurring">Recurring</option>
              <option value="triggered">Triggered</option>
              <option value="facility">Facility</option>
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
              <option value="all">All categories</option>
              {CATEGORY_SUGGESTIONS.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <h2 className="text-sm font-semibold">Bulk upload</h2>
          <button type="button" onClick={downloadTemplate} className="w-full rounded-lg border border-[#1B4F8A] px-3 py-2 text-sm font-semibold text-[#1B4F8A]">Download blank Excel template</button>
          <input type="file" accept=".xlsx,.xls" className="w-full text-sm" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleBulkUpload(f); }} />
          {bulkErrors.length > 0 ? (
            <div className="rounded-lg bg-rose-50 p-2">
              <p className="text-xs font-semibold text-rose-700">Upload validation errors</p>
              {bulkErrors.map((error) => (
                <p key={error.row} className="text-xs text-rose-700">Row {error.row}: {error.errors.join(", ")}</p>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-slate-500">Checkpoints must be added individually after bulk upload.</p>
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <h2 className="text-sm font-semibold">{editingId ? "Edit item" : "Add item"}</h2>

          <input
            value={form.name}
            onChange={(e) => {
              const nextName = e.target.value;
              setForm((prev) => ({ ...prev, name: nextName }));
              void checkName(nextName, editingId ?? undefined);
            }}
            placeholder="Name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {nameError ? <p className="text-xs text-rose-600">{nameError}</p> : null}

          <div className="grid grid-cols-3 gap-2 text-sm">
            {(["recurring", "triggered", "facility"] as const).map((type) => (
              <label key={type} className="flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-2 capitalize">
                <input type="radio" name="type" checked={form.type === type} onChange={() => setForm((prev) => ({ ...prev, type }))} />
                {type}
              </label>
            ))}
          </div>

          <select value={form.frequency} onChange={(e) => setForm((prev) => ({ ...prev, frequency: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="once">Once</option>
            <option value="1hr">Every 1hr</option>
            <option value="2hr">Every 2hr</option>
            <option value="4hr">Every 4hr</option>
            <option value="6hr">Every 6hr</option>
            <option value="8hr">Every 8hr</option>
            <option value="12hr">Every 12hr</option>
            <option value="OD">OD</option>
            <option value="BD">BD</option>
            <option value="TDS">TDS</option>
            <option value="QID">QID</option>
            <option value="daily">Daily at specific time</option>
            <option value="weekly">Weekly on specific day+time</option>
          </select>

          {(form.frequency === "daily" || form.frequency === "weekly") ? (
            <input value={form.frequency_time} onChange={(e) => setForm((prev) => ({ ...prev, frequency_time: e.target.value }))} placeholder="Specific time (e.g. 0800)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          ) : null}

          {form.frequency === "weekly" ? (
            <input value={form.frequency_day} onChange={(e) => setForm((prev) => ({ ...prev, frequency_day: e.target.value }))} placeholder="Day of week" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          ) : null}

          <select value={form.sop_id} onChange={(e) => setForm((prev) => ({ ...prev, sop_id: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Select Solution</option>
            {sops.map((sop) => {
              const kraTitle = sop.kpi?.kra?.title ?? "";
              const kpiTitle = sop.kpi?.title ?? "";
              return <option key={sop.id} value={sop.id}>{`${kraTitle} > ${kpiTitle} > ${sop.title}`}</option>;
            })}
          </select>

          <select value={form.ordering_dept_id} onChange={(e) => setForm((prev) => ({ ...prev, ordering_dept_id: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Ordering Department</option>
            {departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
          </select>

          <select value={form.dispatching_dept_id} onChange={(e) => setForm((prev) => ({ ...prev, dispatching_dept_id: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Dispatching Department</option>
            {departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
          </select>

          <select value={form.vendor_id} onChange={(e) => setForm((prev) => ({ ...prev, vendor_id: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Vendor (optional)</option>
            {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select>

          <label className="flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-sm">
            Billing
            <input type="checkbox" checked={form.billing_flag} onChange={(e) => setForm((prev) => ({ ...prev, billing_flag: e.target.checked }))} />
          </label>

          {form.billing_flag ? (
            <input value={form.unit_cost} onChange={(e) => setForm((prev) => ({ ...prev, unit_cost: e.target.value }))} placeholder="Unit Cost" type="number" min="0" step="0.01" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          ) : null}

          <input list="catalogue-categories" value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} placeholder="Category" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <datalist id="catalogue-categories">
            {CATEGORY_SUGGESTIONS.map((category) => <option key={category} value={category} />)}
          </datalist>

          <div className="space-y-2 rounded-lg border border-slate-200 p-2">
            <p className="text-xs font-semibold">Checkpoints (minimum 1)</p>
            {checkpoints.map((step, index) => (
              <div key={`${index}-${step.description}`} className="space-y-1 rounded border border-slate-200 p-2">
                <p className="text-xs font-medium">Step {index + 1}</p>
                <select value={step.dept_id} onChange={(e) => setCheckpoints((prev) => prev.map((cp, i) => i === index ? { ...cp, dept_id: e.target.value } : cp))} className="w-full rounded border border-slate-300 px-2 py-1 text-xs">
                  <option value="">Department responsible</option>
                  {departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                </select>
                <input value={step.description} onChange={(e) => setCheckpoints((prev) => prev.map((cp, i) => i === index ? { ...cp, description: e.target.value } : cp))} placeholder="Description" className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
                <div className="flex gap-1">
                  <button type="button" onClick={() => moveStep(index, -1)} className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs">Up</button>
                  <button type="button" onClick={() => moveStep(index, 1)} className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs">Down</button>
                  <button type="button" onClick={() => setCheckpoints((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev)} className="flex-1 rounded border border-rose-300 px-2 py-1 text-xs text-rose-700">Remove</button>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setCheckpoints((prev) => [...prev, { dept_id: "", description: "" }])} className="w-full rounded border border-[#1B4F8A] px-2 py-1 text-xs font-semibold text-[#1B4F8A]">+ Add checkpoint</button>
          </div>

          {saveMessage ? (
            <p
              className={`text-sm ${saveMessage.type === "ok" ? "text-emerald-700" : "text-rose-600"}`}
              role={saveMessage.type === "err" ? "alert" : "status"}
            >
              {saveMessage.text}
            </p>
          ) : null}

          <div className="flex gap-2">
            <button type="button" onClick={() => void saveItem()} className="flex-1 rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white">{editingId ? "Save item" : "Create item"}</button>
            {editingId ? (
              <button
                type="button"
                onClick={() => {
                  setSaveMessage(null);
                  resetForm();
                }}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          {filteredItems.map((item) => (
            <button key={item.id} type="button" onClick={() => editItem(item)} className="w-full rounded-xl border border-slate-200 p-3 text-left">
              <p className="text-sm font-semibold">{item.name}</p>
              <p className="text-xs text-slate-600">{item.type} | {item.frequency} | Billing: {item.billing_flag ? "Yes" : "No"} | Cost: {item.unit_cost}</p>
              <p className="text-xs text-slate-500">Category: {item.category ?? "-"}</p>
            </button>
          ))}
        </div>
      </section>
    </CanDo>
  );
}
