"use client";

import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";
import { CanDo } from "@/components/CanDo";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { humanizeResponseError } from "@/lib/feedback/humanizeError";
import { useAsyncAction } from "@/lib/feedback/useAsyncAction";

type AuditRow = {
  id: number;
  date: string;
  time: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor: string;
  old_value: unknown;
  new_value: unknown;
};

export default function AdminAuditPage() {
  const { run, isPending } = useAsyncAction();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [entity, setEntity] = useState("");
  const [actor, setActor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pages = Math.max(1, Math.ceil(total / 50));

  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page) });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (entity) p.set("entity", entity);
    if (actor) p.set("actor", actor);
    return p.toString();
  }, [page, from, to, entity, actor]);

  useEffect(() => {
    const load = async () => {
      setError(null);
      const res = await fetch(`/api/admin/audit?${query}`, { cache: "no-store" });
      if (!res.ok) {
        setError(await humanizeResponseError(res));
        return;
      }
      const data = (await res.json()) as { rows: AuditRow[]; total: number };
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    };
    void load();
  }, [query]);

  const exportExcel = () => {
    void run(
      "audit-export",
      async () => {
        const sheetRows = rows.map((r) => ({
          Date: r.date,
          Time: r.time,
          Action: r.action,
          "Entity Type": r.entity_type,
          "Entity ID": r.entity_id,
          Actor: r.actor,
          "Old Value": JSON.stringify(r.old_value ?? {}),
          "New Value": JSON.stringify(r.new_value ?? {}),
        }));
        const ws = XLSX.utils.json_to_sheet(sheetRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Audit");
        XLSX.writeFile(wb, `OS_Audit_${new Date().toISOString().slice(0, 10)}.xlsx`);
      },
      { successMessage: "Exported" }
    );
  };

  return (
    <CanDo permission={PERMISSIONS.BUILD_SYSTEM} fallback={<p className="text-sm text-slate-600">No access.</p>}>
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#1B4F8A]">Admin - Audit Log</h1>
        <button
          type="button"
          onClick={exportExcel}
          disabled={isPending("audit-export")}
          className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-60"
        >
          {isPending("audit-export") ? "Exporting…" : "Export Excel"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-h-11 rounded border border-slate-300 px-2 py-2 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-h-11 rounded border border-slate-300 px-2 py-2 text-sm" />
        <input
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          placeholder="Entity type (table)"
          className="min-h-11 rounded border border-slate-300 px-2 py-2 text-sm"
        />
        <input
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          placeholder="Actor user id"
          className="min-h-11 rounded border border-slate-300 px-2 py-2 text-sm"
        />
      </div>
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="bg-slate-50">
            <tr>
              {["Date", "Time", "Action", "Entity Type", "Entity ID", "Actor", "Old Value", "New Value"].map((h) => (
                <th key={h} className="p-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-200 align-top">
                <td className="p-2">{r.date}</td>
                <td className="p-2">{r.time}</td>
                <td className="p-2">{r.action}</td>
                <td className="p-2">{r.entity_type}</td>
                <td className="p-2">{r.entity_id || "-"}</td>
                <td className="p-2">{r.actor}</td>
                <td className="p-2 text-[11px] text-slate-600">{JSON.stringify(r.old_value ?? {})}</td>
                <td className="p-2 text-[11px] text-slate-600">{JSON.stringify(r.new_value ?? {})}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="min-h-11 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-40"
        >
          Previous
        </button>
        <p className="text-sm text-slate-600">Page {page} / {pages}</p>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => setPage((p) => Math.min(pages, p + 1))}
          className="min-h-11 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </section>
    </CanDo>
  );
}
