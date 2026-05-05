"use client";

import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";
import { CanDo } from "@/components/CanDo";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { humanizeResponseError } from "@/lib/feedback/humanizeError";
import { useAsyncAction } from "@/lib/feedback/useAsyncAction";
import { UserFacingError } from "@/lib/feedback/userFacingError";
import { useToast } from "@/components/feedback/ToastProvider";

type Department = { id: string; name: string };
type Vendor = { id: string; name: string };
type SOPOption = { id: string; title: string; kpi?: { title?: string; kra?: { title?: string } } };
type Item = {
  id: string;
  name: string;
  is_active: boolean;
  requires_patient: boolean;
  ordering_dept_id: string | null;
  dispatching_dept_id: string | null;
  vendor_id: string | null;
  billing_flag: boolean;
  unit_cost: number;
  sop_id: string | null;
  is_recurring?: boolean | null;
  recurrence_frequency?: string | null;
  recurrence_end_date?: string | null;
};
const RECURRENCE_OPTIONS = ["2hr", "4hr", "6hr", "8hr", "12hr", "24hr", "Daily", "Weekly", "Monthly"] as const;

type Checkpoint = {
  id?: string;
  catalogue_item_id?: string;
  step_number?: number;
  client_id: string;
  dept_id: string;
  department_id?: string;
  description: string;
  assigned_user_id: string;
  is_recurring?: boolean;
  recurrence_frequency?: string;
  recurrence_end_date?: string;
  due_offset_minutes?: number;
};

function toDatetimeLocal(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CataloguePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [sops, setSops] = useState<SOPOption[]>([]);
  const [checkpointsMap, setCheckpointsMap] = useState<Record<string, Checkpoint[]>>({});
  const [staffByDept, setStaffByDept] = useState<Record<string, Array<{ id: string; full_name: string }>>>({});

  const [search, setSearch] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [bulkResult, setBulkResult] = useState<{
    createdCount: number;
    failedCount: number;
    failures: Array<{ row: number; itemName: string; reason: string }>;
  } | null>(null);
  const { showToast } = useToast();
  const { run, isPending } = useAsyncAction();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    requires_patient: true,
    sop_id: "",
    ordering_dept_id: "",
    dispatching_dept_id: "",
    vendor_id: "",
    billing_flag: false,
    unit_cost: "0",
    is_recurring: false,
    recurrence_frequency: "24hr",
    recurrence_end_date: "",
  });
  const makeClientId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const makeDefaultSubTask = (): Checkpoint => ({
    client_id: makeClientId(),
    dept_id: "",
    description: "",
    assigned_user_id: "",
    is_recurring: form.is_recurring,
    recurrence_frequency: form.recurrence_frequency,
    recurrence_end_date: form.recurrence_end_date,
    due_offset_minutes: 0,
  });
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([
    makeDefaultSubTask(),
  ]);

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
      map[key].push({
        client_id: `${checkpoint.id ?? "cp"}-${checkpoint.step_number ?? 0}`,
        dept_id: checkpoint.department_id ?? checkpoint.dept_id ?? "",
        department_id: checkpoint.department_id ?? checkpoint.dept_id ?? "",
        description: checkpoint.description,
        step_number: checkpoint.step_number,
        id: checkpoint.id,
        assigned_user_id: (checkpoint as { assigned_user_id?: string | null }).assigned_user_id ?? "",
        is_recurring: (checkpoint as { is_recurring?: boolean | null }).is_recurring ?? false,
        recurrence_frequency: (checkpoint as { recurrence_frequency?: string | null }).recurrence_frequency ?? "24hr",
        recurrence_end_date: toDatetimeLocal(
          (checkpoint as { recurrence_end_date?: string | null }).recurrence_end_date
        ),
        due_offset_minutes: (checkpoint as { due_offset_minutes?: number | null }).due_offset_minutes ?? 0,
      });
    });
    setCheckpointsMap(map);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
  }, [items, search]);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: "",
      requires_patient: true,
      sop_id: "",
      ordering_dept_id: "",
      dispatching_dept_id: "",
      vendor_id: "",
      billing_flag: false,
      unit_cost: "0",
      is_recurring: false,
      recurrence_frequency: "24hr",
      recurrence_end_date: "",
    });
    setCheckpoints([makeDefaultSubTask()]);
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

  const saveItem = () => {
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
      setSaveMessage({ type: "err", text: "Add at least one sub-task." });
      return;
    }
    const badCheckpoint = checkpoints.findIndex(
      (step) => !step.dept_id || !step.description.trim()
    );
    if (badCheckpoint >= 0) {
      setSaveMessage({
        type: "err",
        text: `Sub-task ${badCheckpoint + 1}: choose a department and enter a description.`,
      });
      return;
    }
    const wasEdit = Boolean(editingId);

    void run(
      "cat-save",
      async () => {
        const payload = {
          ...form,
          name: form.name.trim(),
          requires_patient: form.requires_patient,
          sop_id: form.sop_id || null,
          ordering_dept_id: form.ordering_dept_id || null,
          dispatching_dept_id: form.dispatching_dept_id || null,
          vendor_id: form.vendor_id || null,
          unit_cost: form.billing_flag ? Number(form.unit_cost || 0) : 0,
          billing_flag: form.billing_flag,
          is_recurring: form.is_recurring,
          recurrence_frequency: form.is_recurring ? form.recurrence_frequency : null,
          recurrence_end_date: form.is_recurring ? form.recurrence_end_date || null : null,
          checkpoints: checkpoints.map((step) => ({
            dept_id: step.dept_id,
            department_id: step.dept_id,
            description: step.description.trim(),
            assigned_user_id: step.assigned_user_id.trim() || null,
            is_recurring: Boolean(step.is_recurring),
            recurrence_frequency: step.is_recurring ? step.recurrence_frequency || null : null,
            recurrence_end_date: step.is_recurring ? step.recurrence_end_date || null : null,
            due_offset_minutes: Number(step.due_offset_minutes ?? 0),
          })),
        };

        const response = await fetch("/api/admin/catalogue", {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
        });

        if (!response.ok) {
          throw new UserFacingError(await humanizeResponseError(response));
        }

        resetForm();
        await loadData();
      },
      { successMessage: wasEdit ? "Item updated" : "Item created" }
    );
  };

  const editItem = (item: Item) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      requires_patient: item.requires_patient ?? true,
      sop_id: item.sop_id ?? "",
      ordering_dept_id: item.ordering_dept_id ?? "",
      dispatching_dept_id: item.dispatching_dept_id ?? "",
      vendor_id: item.vendor_id ?? "",
      billing_flag: item.billing_flag,
      unit_cost: String(item.unit_cost ?? 0),
      is_recurring: item.is_recurring ?? false,
      recurrence_frequency: item.recurrence_frequency ?? "24hr",
      recurrence_end_date: toDatetimeLocal(item.recurrence_end_date),
    });
    setCheckpoints(
      (checkpointsMap[item.id] ?? []).map((step) => ({
        client_id: makeClientId(),
        dept_id: step.dept_id,
        department_id: step.department_id ?? step.dept_id,
        description: step.description,
        assigned_user_id: step.assigned_user_id ?? "",
        is_recurring: step.is_recurring ?? (item.is_recurring ?? false),
        recurrence_frequency: step.recurrence_frequency ?? item.recurrence_frequency ?? "24hr",
        recurrence_end_date: step.recurrence_end_date ?? toDatetimeLocal(item.recurrence_end_date),
        due_offset_minutes: step.due_offset_minutes ?? 0,
      }))
    );
    setNameError(null);
  };

  const toggleActive = (item: Item) => {
    void run(
      `cat-toggle-${item.id}`,
      async () => {
        const response = await fetch("/api/admin/catalogue", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id, action: "set_active", is_active: !item.is_active }),
        });
        if (!response.ok) throw new UserFacingError(await humanizeResponseError(response));
        await loadData();
      },
      { successMessage: item.is_active ? "Item deactivated" : "Item reactivated" }
    );
  };

  const ensureStaffLoaded = (deptId: string) => {
    if (!deptId || staffByDept[deptId]) return;
    void (async () => {
      const res = await fetch(
        `/api/admin/catalogue/staff-by-department?department_id=${encodeURIComponent(deptId)}`
      );
      if (!res.ok) return;
      const body = (await res.json()) as { staff: Array<{ id: string; full_name: string }> };
      setStaffByDept((prev) => ({ ...prev, [deptId]: body.staff ?? [] }));
    })();
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
      {
        Name: "",
        "Requires Patient": "",
        "Ordering Department": "",
        "Dispatching Department": "",
        Vendor: "",
        Billing: "",
        "Unit Cost": "",
      },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "ItemCatalogueTemplate");
    XLSX.writeFile(workbook, "agastya-item-catalogue-template.xlsx");
  };

  const handleBulkUpload = (file: File) => {
    void run(
      "cat-bulk",
      async () => {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

        const importRes = await fetch("/api/admin/catalogue/bulk/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows }),
        });
        if (!importRes.ok) throw new UserFacingError(await humanizeResponseError(importRes));

        const result = (await importRes.json()) as {
          createdCount: number;
          failedCount: number;
          failures: Array<{ row: number; itemName: string; reason: string }>;
        };

        setBulkResult({
          createdCount: result.createdCount,
          failedCount: result.failedCount,
          failures: result.failures ?? [],
        });
        showToast(
          "success",
          `${result.createdCount} items created, ${result.failedCount} rows failed`
        );
        await loadData();
      },
      { successMessage: null }
    );
  };

  return (
    <CanDo permission={PERMISSIONS.BUILD_SYSTEM} fallback={<p className="text-sm text-slate-600">No access.</p>}>
      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-[#1B4F8A]">Admin - Item Catalogue</h1>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <h2 className="text-sm font-semibold">Search</h2>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by item name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <h2 className="text-sm font-semibold">Bulk upload</h2>
          <p className="text-xs text-slate-600">
            Columns: <span className="font-medium">Name</span>, <span className="font-medium">Requires Patient</span>{" "}
            (yes/no), <span className="font-medium">Ordering Department</span>,{" "}
            <span className="font-medium">Dispatching Department</span> (department names, optional cells empty),{" "}
            <span className="font-medium">Vendor</span> (optional), <span className="font-medium">Billing</span> (yes/no),{" "}
            <span className="font-medium">Unit Cost</span> (optional number). Sub-tasks must be added after import.
          </p>
          <button type="button" onClick={downloadTemplate} className="w-full rounded-lg border border-[#1B4F8A] px-3 py-2 text-sm font-semibold text-[#1B4F8A]">Download blank Excel template</button>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="w-full text-sm"
            disabled={isPending("cat-bulk")}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleBulkUpload(f);
            }}
          />
          {bulkResult ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
              <p className="font-semibold text-slate-800">
                {bulkResult.createdCount} items created, {bulkResult.failedCount} rows failed
              </p>
              {bulkResult.failures.length > 0 ? (
                <ul className="mt-2 max-h-40 list-inside list-disc space-y-1 overflow-y-auto text-slate-700">
                  {bulkResult.failures.map((f, idx) => (
                    <li key={`${f.row}-${idx}-${f.reason}`}>
                      Row {f.row}
                      {f.itemName ? ` (${f.itemName})` : ""}: {f.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
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

          <label className="flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-sm">
            Link to patient
            <input
              type="checkbox"
              checked={form.requires_patient}
              onChange={(e) => setForm((prev) => ({ ...prev, requires_patient: e.target.checked }))}
            />
          </label>

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

          <label className="flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-sm">
            Item recurring?
            <input
              type="checkbox"
              checked={form.is_recurring}
              onChange={(e) => setForm((prev) => ({ ...prev, is_recurring: e.target.checked }))}
            />
          </label>
          {form.is_recurring ? (
            <>
              <select
                value={form.recurrence_frequency}
                onChange={(e) => setForm((prev) => ({ ...prev, recurrence_frequency: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {RECURRENCE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={form.recurrence_end_date}
                onChange={(e) => setForm((prev) => ({ ...prev, recurrence_end_date: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </>
          ) : null}

          <div className="space-y-2 rounded-lg border border-slate-200 p-2">
            <p className="text-xs font-semibold">Sub-tasks (minimum 1)</p>
            {checkpoints.map((step, index) => (
              <div key={step.client_id} className="space-y-1 rounded border border-slate-200 p-2">
                <p className="text-xs font-medium">Step order</p>
                <input
                  type="number"
                  value={index + 1}
                  disabled
                  className="w-full rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs"
                />
                <select
                  value={step.dept_id}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCheckpoints((prev) =>
                      prev.map((cp, i) =>
                        i === index ? { ...cp, dept_id: v, assigned_user_id: "" } : cp
                      )
                    );
                    if (v) ensureStaffLoaded(v);
                  }}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                >
                  <option value="">Department responsible</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs font-medium">Name</p>
                <input
                  value={step.description}
                  onChange={(e) =>
                    setCheckpoints((prev) =>
                      prev.map((cp, i) => (i === index ? { ...cp, description: e.target.value } : cp))
                    )
                  }
                  placeholder="Sub-task name"
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                />
                <label className="block text-xs text-slate-600">
                  Assign to specific user (optional)
                  <select
                    value={step.assigned_user_id}
                    onFocus={() => step.dept_id && ensureStaffLoaded(step.dept_id)}
                    onChange={(e) =>
                      setCheckpoints((prev) =>
                        prev.map((cp, i) => (i === index ? { ...cp, assigned_user_id: e.target.value } : cp))
                      )
                    }
                    className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="">Auto-assign</option>
                    {(staffByDept[step.dept_id] ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name || s.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center justify-between rounded border border-slate-300 px-2 py-1 text-xs">
                  Recurring?
                  <input
                    type="checkbox"
                    checked={Boolean(step.is_recurring)}
                    onChange={(e) =>
                      setCheckpoints((prev) =>
                        prev.map((cp, i) =>
                          i === index
                            ? {
                                ...cp,
                                is_recurring: e.target.checked,
                                recurrence_frequency: cp.recurrence_frequency ?? form.recurrence_frequency,
                                recurrence_end_date: cp.recurrence_end_date ?? form.recurrence_end_date,
                              }
                            : cp
                        )
                      )
                    }
                  />
                </label>
                {step.is_recurring ? (
                  <>
                    <label className="block text-xs text-slate-600">
                      Recurrence frequency
                      <select
                        value={step.recurrence_frequency ?? "24hr"}
                        onChange={(e) =>
                          setCheckpoints((prev) =>
                            prev.map((cp, i) =>
                              i === index ? { ...cp, recurrence_frequency: e.target.value } : cp
                            )
                          )
                        }
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                      >
                        {RECURRENCE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-slate-600">
                      Repeat until
                      <input
                        type="datetime-local"
                        value={step.recurrence_end_date ?? ""}
                        onChange={(e) =>
                          setCheckpoints((prev) =>
                            prev.map((cp, i) =>
                              i === index ? { ...cp, recurrence_end_date: e.target.value } : cp
                            )
                          )
                        }
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                    </label>
                  </>
                ) : null}
                <label className="block text-xs text-slate-600">
                  Due X minutes after item is raised
                  <input
                    type="number"
                    min="0"
                    value={step.due_offset_minutes ?? 0}
                    onChange={(e) =>
                      setCheckpoints((prev) =>
                        prev.map((cp, i) =>
                          i === index ? { ...cp, due_offset_minutes: Number(e.target.value || 0) } : cp
                        )
                      )
                    }
                    className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  />
                </label>
                <div className="flex gap-1">
                  <button type="button" onClick={() => moveStep(index, -1)} className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs">Up</button>
                  <button type="button" onClick={() => moveStep(index, 1)} className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs">Down</button>
                  <button type="button" onClick={() => setCheckpoints((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev)} className="flex-1 rounded border border-rose-300 px-2 py-1 text-xs text-rose-700">Remove</button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setCheckpoints((prev) => [
                  ...prev,
                  {
                    ...makeDefaultSubTask(),
                  },
                ])
              }
              className="w-full rounded border border-[#1B4F8A] px-2 py-1 text-xs font-semibold text-[#1B4F8A]"
            >
              + Add sub-task
            </button>
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
            <button
              type="button"
              onClick={saveItem}
              disabled={isPending("cat-save")}
              className="flex-1 rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isPending("cat-save") ? "Saving…" : editingId ? "Save item" : "Create item"}
            </button>
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
            <div key={item.id} className="w-full rounded-xl border border-slate-200 p-3 text-left">
              <p className="text-sm font-semibold">{item.name} {!item.is_active ? "(Inactive)" : ""}</p>
              <p className="text-xs text-slate-600">
                {item.requires_patient ? "Patient-linked" : "Standalone"} | Billing: {item.billing_flag ? "Yes" : "No"} | Cost: {item.unit_cost}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => editItem(item)}
                  className="rounded border border-[#1B4F8A] px-2 py-1 text-xs text-[#1B4F8A]"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(item)}
                  disabled={isPending(`cat-toggle-${item.id}`)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs text-rose-700 disabled:opacity-60"
                >
                  {isPending(`cat-toggle-${item.id}`) ? "Updating…" : item.is_active ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </CanDo>
  );
}
