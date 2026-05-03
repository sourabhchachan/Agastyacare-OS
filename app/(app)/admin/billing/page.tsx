"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/feedback/ToastProvider";
import { humanizeError, humanizeResponseError } from "@/lib/feedback/humanizeError";
import { UserFacingError } from "@/lib/feedback/userFacingError";

type Summary = {
  totalToday: number;
  totalThisWeek: number;
  totalThisMonth: number;
  activePatientCount: number;
};

type PRow = {
  id: string;
  patient_number: string;
  name: string;
  runningTotal: number;
};

export default function BillingDashboardPage() {
  const { showToast } = useToast();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [patients, setPatients] = useState<PRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [load, setLoad] = useState(true);

  useEffect(() => {
    const go = async () => {
      setErr(null);
      const [a, b] = await Promise.all([
        fetch("/api/admin/billing/summary", { cache: "no-store" }),
        fetch("/api/admin/billing/patients", { cache: "no-store" }),
      ]);
      if (a.status === 403) throw new UserFacingError(await humanizeResponseError(a));
      if (!a.ok) throw new UserFacingError(await humanizeResponseError(a));
      if (!b.ok) throw new UserFacingError(await humanizeResponseError(b));
      const s = (await a.json()) as Summary;
      const p = (await b.json()) as { patients: PRow[] };
      setSummary(s);
      setPatients(p.patients);
    };
    void (async () => {
      try {
        await go();
      } catch (e) {
        const msg = humanizeError(e);
        setErr(msg);
        showToast("error", msg);
      } finally {
        setLoad(false);
      }
    })();
  }, [showToast]);

  if (load) {
    return <p className="text-slate-600">Loading…</p>;
  }
  if (err) {
    return <p className="text-red-600">{err}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Billing</h1>
          <p className="text-sm text-slate-600">Patient cost overview</p>
        </div>
        <Link
          href="/admin/billing/master"
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800"
        >
          Master sheet
        </Link>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Total today</p>
            <p className="text-lg font-semibold">₹{summary.totalToday.toFixed(2)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500">This week</p>
            <p className="text-lg font-semibold">₹{summary.totalThisWeek.toFixed(2)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500">This month</p>
            <p className="text-lg font-semibold">₹{summary.totalThisMonth.toFixed(2)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Active patients</p>
            <p className="text-lg font-semibold">{summary.activePatientCount}</p>
          </div>
        </div>
      )}

      <h2 className="text-sm font-semibold text-slate-800">Active patients (running cost)</h2>
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200">
        {patients.map((p) => (
          <li key={p.id}>
            <Link
              href={`/admin/billing/patients/${p.id}`}
              className="block px-3 py-3 text-sm active:bg-slate-50"
            >
              <div className="font-medium text-slate-900">
                {p.patient_number} — {p.name}
              </div>
              <div className="text-slate-600">₹{p.runningTotal.toFixed(2)}</div>
            </Link>
          </li>
        ))}
        {patients.length === 0 ? (
          <li className="px-3 py-4 text-sm text-slate-500">No active patients.</li>
        ) : null}
      </ul>
    </div>
  );
}
