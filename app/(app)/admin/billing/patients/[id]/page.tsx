"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/feedback/ToastProvider";
import { humanizeError, humanizeResponseError } from "@/lib/feedback/humanizeError";
import { UserFacingError } from "@/lib/feedback/userFacingError";

type Line = {
  id: string;
  item_name: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  status: string;
  patient_number: string;
  patient_name: string;
};

export default function PatientBillingPage() {
  const { showToast } = useToast();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [lines, setLines] = useState<Line[]>([]);
  const [meta, setMeta] = useState<{ patient_number: string; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [load, setLoad] = useState(true);

  useEffect(() => {
    if (!id) return;
    const go = async () => {
      setErr(null);
      const r = await fetch(
        `/api/admin/billing/lines?${new URLSearchParams({ patientId: id })}`,
        { cache: "no-store" }
      );
      if (r.status === 403) throw new UserFacingError(await humanizeResponseError(r));
      if (!r.ok) throw new UserFacingError(await humanizeResponseError(r));
      const j = (await r.json()) as {
        lines: Line[];
        patient: { patient_number: string; name: string } | null;
      };
      setLines((j.lines ?? []) as Line[]);
      setMeta(
        j.patient ??
          (j.lines?.[0]
            ? {
                patient_number: (j.lines[0] as Line).patient_number,
                name: (j.lines[0] as Line).patient_name,
              }
            : null)
      );
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
  }, [id, showToast]);

  if (load) {
    return <p className="text-slate-600">Loading…</p>;
  }
  if (err) {
    return <p className="text-red-600">{err}</p>;
  }

  const head = lines[0];
  const title =
    meta ??
    (head
      ? { patient_number: head.patient_number, name: head.patient_name }
      : null);

  return (
    <div className="space-y-3">
      <Link href="/admin/billing" className="text-sm text-[#1B4F8A]">
        ← Back to billing
      </Link>
      {title ? (
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {title.patient_number} — {title.name}
          </h1>
          <p className="text-sm text-slate-600">Bill lines</p>
        </div>
      ) : (
        <h1 className="text-lg font-bold text-slate-900">Patient</h1>
      )}
      <ul className="space-y-2">
        {lines.map((b) => (
          <li key={b.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="font-medium text-slate-900">{b.item_name}</div>
            <div className="mt-1 text-slate-600">
              Qty {b.quantity} × ₹{b.unit_cost.toFixed(2)} = ₹{b.total_cost.toFixed(2)} · {b.status}
            </div>
          </li>
        ))}
        {lines.length === 0 ? <li className="text-slate-500">No bill lines.</li> : null}
      </ul>
    </div>
  );
}
