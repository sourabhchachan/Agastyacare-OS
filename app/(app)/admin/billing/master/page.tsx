"use client";

import * as XLSX from "xlsx";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Line = {
  id: string;
  patient_number: string;
  item_name: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  ordered_by_name: string;
  order_date_formatted: string;
  order_time: string;
  dispatched_by_name: string;
  dispatch_date_formatted: string;
  dispatch_time: string;
  received_by_name: string;
  receive_date_formatted: string;
  receive_time: string;
  status: string;
  cancellation_remarks: string;
};

type POpt = { id: string; patient_number: string; name: string };

function buildQuery(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v && v !== "") sp.set(k, v);
  });
  return sp.toString();
}

export default function MasterBillingPage() {
  const [lines, setLines] = useState<Line[]>([]);
  const [patients, setPatients] = useState<POpt[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [patientId, setPatientId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [load, setLoad] = useState(true);

  const loadFilters = useCallback(async () => {
    const [p, c] = await Promise.all([
      fetch("/api/admin/billing/patients", { cache: "no-store" }),
      fetch("/api/admin/billing/categories", { cache: "no-store" }),
    ]);
    if (p.ok) {
      const j = (await p.json()) as { patients: POpt[] };
      setPatients(j.patients ?? []);
    }
    if (c.ok) {
      const j = (await c.json()) as { categories: string[] };
      setCategories(j.categories ?? []);
    }
  }, []);

  const loadLines = useCallback(async () => {
    setErr(null);
    setLoad(true);
    const q = buildQuery({
      patientId: patientId || undefined,
      from: from || undefined,
      to: to || undefined,
      status: status || undefined,
      category: category || undefined,
    });
    const r = await fetch(`/api/admin/billing/lines?${q}`, { cache: "no-store" });
    if (r.status === 403) {
      setErr("Forbidden");
      setLoad(false);
      return;
    }
    if (!r.ok) {
      setErr((await r.json())?.error ?? r.statusText);
      setLoad(false);
      return;
    }
    const j = (await r.json()) as { lines: Line[] };
    setLines(j.lines ?? []);
    setLoad(false);
  }, [patientId, from, to, status, category]);

  useEffect(() => {
    void loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    void loadLines();
  }, [loadLines]);

  const totalSum = useMemo(
    () => lines.reduce((s, r) => s + (Number.isFinite(r.total_cost) ? r.total_cost : 0), 0),
    [lines]
  );

  const downloadExcel = () => {
    const header = [
      "Patient No.",
      "Item Name",
      "Quantity",
      "Unit Cost",
      "Total Cost",
      "Ordered By",
      "Order Date (DD/MM/YY)",
      "Order Time (HHMM)",
      "Dispatched By",
      "Dispatch Date (DD/MM/YY)",
      "Dispatch Time (HHMM)",
      "Received By",
      "Receive Date (DD/MM/YY)",
      "Receive Time (HHMM)",
      "Status",
      "Cancellation Remarks",
    ];
    const body = lines.map((r) => [
      r.patient_number,
      r.item_name,
      r.quantity,
      r.unit_cost,
      r.total_cost,
      r.ordered_by_name,
      r.order_date_formatted,
      r.order_time,
      r.dispatched_by_name,
      r.dispatch_date_formatted,
      r.dispatch_time,
      r.received_by_name,
      r.receive_date_formatted,
      r.receive_time,
      r.status,
      r.cancellation_remarks,
    ]);
    const d = new Date();
    const stamp = `${String(d.getDate()).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}${d.getFullYear()}`;
    const summaryRow = [
      "Total",
      "",
      "",
      "",
      Math.round(totalSum * 100) / 100,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ];
    const aoa = [header, ...body, summaryRow];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Billing");
    XLSX.writeFile(wb, `OS_Billing_${stamp}.xlsx`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link href="/admin/billing" className="text-sm text-[#1B4F8A]">
            ← Billing dashboard
          </Link>
          <h1 className="mt-1 text-lg font-bold text-slate-900">Master billing sheet</h1>
        </div>
        <button
          type="button"
          onClick={downloadExcel}
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800"
        >
          Download Excel
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 text-sm">
        <label className="block">
          <span className="text-xs text-slate-500">Patient</span>
          <select
            className="mt-0.5 w-full rounded border border-slate-300 p-1.5"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
          >
            <option value="">All</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.patient_number} — {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-slate-500">From</span>
            <input
              type="date"
              className="mt-0.5 w-full rounded border border-slate-300 p-1.5"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">To</span>
            <input
              type="date"
              className="mt-0.5 w-full rounded border border-slate-300 p-1.5"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-slate-500">Status</span>
            <select
              className="mt-0.5 w-full rounded border border-slate-300 p-1.5"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All</option>
              <option value="ordered">ordered</option>
              <option value="dispatched">dispatched</option>
              <option value="received">received</option>
              <option value="cancelled">cancelled</option>
              <option value="not_done">not_done</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">Category</span>
            <select
              className="mt-0.5 w-full rounded border border-slate-300 p-1.5"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {load ? <p className="text-slate-600">Loading…</p> : null}

      {!load && !err && (
        <div className="overflow-x-auto border border-slate-200">
          <table className="min-w-[1000px] w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="p-1.5 font-semibold">Patient No.</th>
                <th className="p-1.5 font-semibold">Item Name</th>
                <th className="p-1.5 font-semibold">Qty</th>
                <th className="p-1.5 font-semibold">Unit</th>
                <th className="p-1.5 font-semibold">Total</th>
                <th className="p-1.5 font-semibold">Ordered By</th>
                <th className="p-1.5 font-semibold">Order date</th>
                <th className="p-1.5 font-semibold">Order time</th>
                <th className="p-1.5 font-semibold">Disp. by</th>
                <th className="p-1.5 font-semibold">Disp. date</th>
                <th className="p-1.5 font-semibold">Disp. time</th>
                <th className="p-1.5 font-semibold">Recv. by</th>
                <th className="p-1.5 font-semibold">Recv. date</th>
                <th className="p-1.5 font-semibold">Recv. time</th>
                <th className="p-1.5 font-semibold">Status</th>
                <th className="p-1.5 font-semibold">Canc. remarks</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="p-1.5 align-top">{r.patient_number}</td>
                  <td className="p-1.5 align-top">{r.item_name}</td>
                  <td className="p-1.5 align-top">{r.quantity}</td>
                  <td className="p-1.5 align-top">₹{r.unit_cost.toFixed(2)}</td>
                  <td className="p-1.5 align-top">₹{r.total_cost.toFixed(2)}</td>
                  <td className="p-1.5 align-top">{r.ordered_by_name || "—"}</td>
                  <td className="p-1.5 align-top whitespace-nowrap">{r.order_date_formatted}</td>
                  <td className="p-1.5 align-top">{r.order_time}</td>
                  <td className="p-1.5 align-top">{r.dispatched_by_name || "—"}</td>
                  <td className="p-1.5 align-top whitespace-nowrap">
                    {r.dispatch_date_formatted}
                  </td>
                  <td className="p-1.5 align-top">{r.dispatch_time || "—"}</td>
                  <td className="p-1.5 align-top">{r.received_by_name || "—"}</td>
                  <td className="p-1.5 align-top whitespace-nowrap">
                    {r.receive_date_formatted}
                  </td>
                  <td className="p-1.5 align-top">{r.receive_time || "—"}</td>
                  <td className="p-1.5 align-top">{r.status}</td>
                  <td className="p-1.5 align-top text-slate-600">{r.cancellation_remarks || "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td colSpan={4} className="p-1.5 text-right">
                  Total
                </td>
                <td className="p-1.5">₹{totalSum.toFixed(2)}</td>
                <td colSpan={11} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
