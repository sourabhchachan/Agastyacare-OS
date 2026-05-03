"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CanDo } from "@/components/CanDo";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { humanizeResponseError } from "@/lib/feedback/humanizeError";
import { useAsyncAction } from "@/lib/feedback/useAsyncAction";
import { UserFacingError } from "@/lib/feedback/userFacingError";

type PatientOption = { id: string; name: string; patient_number: string; bed_number: string };
type CatOption = {
  id: string;
  name: string;
  requires_patient: boolean;
  dispatching_dept_id: string | null;
};
type StaffOption = { id: string; full_name: string; is_active: boolean };
type UserDepartment = { user_id: string; department_id: string };

const RECURRENCE_OPTIONS = [
  "2hr",
  "4hr",
  "6hr",
  "8hr",
  "12hr",
  "24hr",
  "daily",
  "weekly",
  "monthly",
  "yearly",
];

function formatRecurrence(option: string): string {
  if (option.endsWith("hr")) return `Every ${option.replace("hr", " hr")}`;
  return option.charAt(0).toUpperCase() + option.slice(1);
}

export default function RaiseItemPage() {
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [catalogue, setCatalogue] = useState<CatOption[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffOption[]>([]);
  const [userDepartments, setUserDepartments] = useState<UserDepartment[]>([]);
  const [q, setQ] = useState("");
  const [catId, setCatId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [dueAt, setDueAt] = useState(() => new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 16));
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState("4hr");
  const [recurrenceDeadline, setRecurrenceDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { run, isPending } = useAsyncAction();

  const selectedCat = useMemo(() => catalogue.find((c) => c.id === catId), [catalogue, catId]);

  useEffect(() => {
    if (!selectedCat || !isRecurring) {
      setRecurrenceDeadline("");
      return;
    }
    setRecurrenceDeadline(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16));
  }, [selectedCat, isRecurring]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/raise-item/options");
      if (!res.ok) return;
      const d = (await res.json()) as {
        patients: PatientOption[];
        catalogueItems: CatOption[];
        staffUsers: StaffOption[];
        userDepartments: UserDepartment[];
      };
      setPatients(d.patients ?? []);
      setCatalogue(d.catalogueItems ?? []);
      setStaffUsers(d.staffUsers ?? []);
      setUserDepartments(d.userDepartments ?? []);
    })();
  }, []);

  const filteredPatients = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return patients;
    return patients.filter(
      (p) => p.name.toLowerCase().includes(s) || p.patient_number.toLowerCase().includes(s)
    );
  }, [patients, q]);

  const assignableUsers = useMemo(() => {
    if (!selectedCat?.dispatching_dept_id) return [];
    const allowedIds = new Set(
      userDepartments
        .filter((row) => row.department_id === selectedCat.dispatching_dept_id)
        .map((row) => row.user_id)
    );
    return staffUsers.filter((u) => allowedIds.has(u.id));
  }, [selectedCat?.dispatching_dept_id, userDepartments, staffUsers]);

  const submit = () => {
    setErr(null);
    setMsg(null);
    if (!catId) {
      setErr("Select item.");
      return;
    }
    if (selectedCat?.requires_patient && !patientId) {
      setErr("Select patient for this item.");
      return;
    }
    if (!dueAt) {
      setErr("Select due time.");
      return;
    }
    if (isRecurring) {
      if (!recurrenceDeadline) {
        setErr('Set "Repeat until" — when recurrence should stop.');
        return;
      }
    }

    void run(
      "raise-submit",
      async () => {
        const res = await fetch("/api/items/raise", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            catalogueItemId: catId,
            patientId: selectedCat?.requires_patient ? patientId : undefined,
            assignedUserId: assignedUserId || undefined,
            dueAt: new Date(dueAt).toISOString(),
            isRecurring,
            recurrenceFrequency: isRecurring ? recurrenceFrequency : undefined,
            recurrenceDeadline: recurrenceDeadline ? new Date(recurrenceDeadline).toISOString() : undefined,
            notes: notes || undefined,
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          assigneeName?: string;
          ok?: boolean;
          totalInstances?: number;
        };
        if (!res.ok) {
          throw new UserFacingError(await humanizeResponseError(res));
        }
        setMsg(
          `Item ordered. ${data.totalInstances ?? 1} instance(s) assigned to ${data.assigneeName ?? "staff"}.`
        );
        setCatId("");
        setPatientId("");
        setAssignedUserId("");
        setDueAt(new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 16));
        setIsRecurring(false);
        setRecurrenceFrequency("4hr");
        setRecurrenceDeadline("");
        setNotes("");
      },
      { successMessage: "Item raised" }
    );
  };

  return (
    <CanDo permission={PERMISSIONS.RAISE_ITEMS} fallback={<p className="text-sm text-slate-600">No access.</p>}>
      <section className="space-y-4">
        <Link href="/" className="text-xs text-[#1B4F8A]">← Queue</Link>
        <h1 className="text-xl font-semibold text-[#1B4F8A]">Raise item</h1>

        <div className="space-y-2">
          <label className="text-sm font-medium">Catalogue item</label>
          <select
            value={catId}
            onChange={(e) => setCatId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select item</option>
            {catalogue.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
            />
            Recurring?
          </label>

          {isRecurring ? (
            <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/80 p-3">
              <div className="space-y-1.5">
                <label htmlFor="raise-first-due" className="block text-sm font-medium text-slate-900">
                  {"Due date & time — when is the first instance due"}
                </label>
                <input
                  id="raise-first-due"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="raise-repeat-frequency" className="block text-sm font-medium text-slate-900">
                  Repeat frequency — how often it repeats (2hr, 4hr, 6hr, 8hr, 12hr, 24hr, Daily, Weekly, Monthly, Yearly)
                </label>
                <select
                  id="raise-repeat-frequency"
                  value={recurrenceFrequency}
                  onChange={(e) => setRecurrenceFrequency(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {RECURRENCE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {formatRecurrence(option)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="raise-repeat-until" className="block text-sm font-medium text-slate-900">
                  Repeat until — date and time when recurrence stops
                </label>
                <input
                  id="raise-repeat-until"
                  type="datetime-local"
                  value={recurrenceDeadline}
                  onChange={(e) => setRecurrenceDeadline(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="raise-due-once" className="block text-sm font-medium text-slate-900">
                {"Due date & time"}
              </label>
              <input
                id="raise-due-once"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>

        {selectedCat?.requires_patient ? (
          <div className="space-y-2">
            <label className="text-sm font-medium">Patient</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or patient number"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select active patient</option>
              {filteredPatients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.patient_number} — {p.name} (bed {p.bed_number})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
            This item does not require patient linkage and will route directly to a user in fulfilling department.
          </p>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium">Assign to specific user (optional)</label>
          <select
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Auto-assign</option>
            {assignableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            rows={3}
          />
        </div>

        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}

        <button
          type="button"
          onClick={submit}
          disabled={isPending("raise-submit")}
          className="w-full rounded-xl bg-[#1B4F8A] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isPending("raise-submit") ? "Submitting…" : "Submit"}
        </button>
      </section>
    </CanDo>
  );
}
