"use client";

import { useEffect, useMemo, useState } from "react";
import { CanDo } from "@/components/CanDo";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { useToast } from "@/components/feedback/ToastProvider";
import { humanizeError, humanizeResponseError } from "@/lib/feedback/humanizeError";
import { useAsyncAction } from "@/lib/feedback/useAsyncAction";
import { UserFacingError } from "@/lib/feedback/userFacingError";

type Department = { id: string; name: string };
type Staff = { id: string; full_name: string; is_active: boolean };
type UserDepartment = { user_id: string; department_id: string };
type Assignment = {
  id: string;
  dept_id: string;
  assigned_user_id: string;
  bed_range_start: string;
  bed_range_end: string;
};

type BedRow = {
  id: string;
  name: string;
  ward: string | null;
  is_active: boolean;
  created_at: string;
  status: string;
};

export default function BedAssignmentsPage() {
  const { showToast } = useToast();
  const { run, isPending } = useAsyncAction();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<Staff[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [userDepartments, setUserDepartments] = useState<UserDepartment[]>([]);
  const [beds, setBeds] = useState<BedRow[]>([]);
  const [newBedName, setNewBedName] = useState("");
  const [newBedWard, setNewBedWard] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [deptId, setDeptId] = useState("");
  const [userId, setUserId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const loadBeds = async () => {
    const res = await fetch("/api/admin/beds");
    if (!res.ok) throw new UserFacingError(await humanizeResponseError(res));
    const result = (await res.json()) as { beds: BedRow[] };
    setBeds(result.beds ?? []);
  };

  const loadData = async () => {
    const response = await fetch("/api/admin/bed-assignments");
    if (!response.ok) throw new UserFacingError(await humanizeResponseError(response));
    const result = (await response.json()) as {
      departments: Department[];
      users: Staff[];
      assignments: Assignment[];
      userDepartments: UserDepartment[];
    };
    setDepartments(result.departments ?? []);
    setUsers(result.users ?? []);
    setAssignments(result.assignments ?? []);
    setUserDepartments(result.userDepartments ?? []);
  };

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadData(), loadBeds()]);
      } catch (e) {
        showToast("error", humanizeError(e));
      }
    })();
  }, [showToast]);

  const grouped = useMemo(() => {
    const map: Record<string, Assignment[]> = {};
    assignments.forEach((a) => {
      if (!map[a.dept_id]) map[a.dept_id] = [];
      map[a.dept_id].push(a);
    });
    return map;
  }, [assignments]);

  const usersForDepartment = useMemo(() => {
    const activeDeptId = deptId || "";
    if (!activeDeptId) return users;
    const allowedIds = new Set(
      userDepartments
        .filter((row) => row.department_id === activeDeptId)
        .map((row) => row.user_id)
    );
    return users.filter((u) => allowedIds.has(u.id));
  }, [deptId, users, userDepartments]);

  const save = () => {
    void run(
      "bed-save",
      async () => {
        const res = await fetch("/api/admin/bed-assignments", {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editingId
              ? { id: editingId, assigned_user_id: userId, bed_range_start: start, bed_range_end: end }
              : { dept_id: deptId, assigned_user_id: userId, bed_range_start: start, bed_range_end: end }
          ),
        });
        if (!res.ok) throw new UserFacingError(await humanizeResponseError(res));
        setEditingId(null);
        setDeptId("");
        setUserId("");
        setStart("");
        setEnd("");
        await loadData();
      },
      { successMessage: "Bed assignment saved" }
    );
  };

  const remove = (id: string) => {
    void run(
      `bed-remove-${id}`,
      async () => {
        const res = await fetch("/api/admin/bed-assignments", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!res.ok) throw new UserFacingError(await humanizeResponseError(res));
        await loadData();
      },
      { successMessage: "Assignment removed" }
    );
  };

  const addBed = () => {
    void run(
      "bed-registry-add",
      async () => {
        const res = await fetch("/api/admin/beds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newBedName.trim(), ward: newBedWard.trim() || null }),
        });
        if (!res.ok) throw new UserFacingError(await humanizeResponseError(res));
        setNewBedName("");
        setNewBedWard("");
        await loadBeds();
      },
      { successMessage: "Bed added" }
    );
  };

  const deactivateBed = (id: string) => {
    void run(
      `bed-registry-off-${id}`,
      async () => {
        const res = await fetch("/api/admin/beds", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, is_active: false }),
        });
        if (!res.ok) throw new UserFacingError(await humanizeResponseError(res));
        await loadBeds();
      },
      { successMessage: "Bed deactivated" }
    );
  };

  return (
    <CanDo permission={PERMISSIONS.MANAGE_USERS} fallback={<p className="text-sm text-slate-600">No access.</p>}>
      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-[#1B4F8A]">Admin - Bed Assignments</h1>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <h2 className="text-sm font-semibold">Bed inventory</h2>
          <p className="text-xs text-slate-600">
            Define physical beds for patient admission. Status is <span className="font-medium">Available</span> when no
            active patient is assigned, or <span className="font-medium">Occupied</span> when a patient is admitted.
            Deactivated beds stay in the list but cannot be selected for new admissions.
          </p>
          <input
            value={newBedName}
            onChange={(e) => setNewBedName(e.target.value)}
            placeholder="Bed number / name (e.g. Bed 1, ICU-2)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={newBedWard}
            onChange={(e) => setNewBedWard(e.target.value)}
            placeholder="Ward / type (optional, e.g. General, ICU)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addBed}
            disabled={isPending("bed-registry-add") || !newBedName.trim()}
            className="w-full rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isPending("bed-registry-add") ? "Adding…" : "Add bed"}
          </button>
          <div className="mt-3 space-y-2">
            {beds.length === 0 ? (
              <p className="text-xs text-slate-500">No beds defined yet.</p>
            ) : (
              beds.map((b) => (
                <div
                  key={b.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 px-2 py-2 text-xs ${
                    b.is_active ? "" : "bg-slate-50 opacity-90"
                  }`}
                >
                  <div>
                    <p className="font-semibold text-slate-900">{b.name}</p>
                    {b.ward ? <p className="text-slate-600">Ward: {b.ward}</p> : null}
                    <p className="text-slate-600">
                      Status:{" "}
                      <span className={b.status === "Occupied" ? "text-amber-800" : b.status === "Available" ? "text-emerald-700" : ""}>
                        {b.status}
                      </span>
                    </p>
                  </div>
                  {b.is_active ? (
                    <button
                      type="button"
                      onClick={() => deactivateBed(b.id)}
                      disabled={isPending(`bed-registry-off-${b.id}`) || b.status === "Occupied"}
                      className="rounded border border-rose-300 px-2 py-1 text-rose-700 disabled:opacity-50"
                      title={b.status === "Occupied" ? "Discharge the patient before deactivating this bed." : undefined}
                    >
                      {isPending(`bed-registry-off-${b.id}`) ? "…" : "Deactivate"}
                    </button>
                  ) : (
                    <span className="text-slate-500">Inactive</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <h2 className="text-sm font-semibold">{editingId ? "Edit assignment" : "Staff bed ranges"}</h2>
          <p className="text-xs text-slate-500">
            Map numeric bed ranges to staff in each department (used for item routing). This is separate from the bed
            inventory above.
          </p>
          {!editingId ? (
            <select value={deptId} onChange={(e) => setDeptId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Select department</option>
              {departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
            </select>
          ) : null}
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Select active user</option>
            {usersForDepartment.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="Start" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="End" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button
            type="button"
            onClick={save}
            disabled={isPending("bed-save")}
            className="w-full rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isPending("bed-save") ? "Saving…" : "Save"}
          </button>
        </div>

        <div className="space-y-3">
          {departments.map((dept) => (
            <div key={dept.id} className="rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-semibold">{dept.name}</p>
              <div className="mt-2 space-y-2">
                {(grouped[dept.id] ?? []).map((a) => {
                  const user = users.find((u) => u.id === a.assigned_user_id);
                  return (
                    <div key={a.id} className="rounded border border-slate-200 p-2 text-xs">
                      <p>{user?.full_name ?? "Unknown"} → Bed {a.bed_range_start} to {a.bed_range_end}</p>
                      <div className="mt-1 flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(a.id);
                            setDeptId(a.dept_id);
                            setUserId(a.assigned_user_id);
                            setStart(a.bed_range_start);
                            setEnd(a.bed_range_end);
                          }}
                          className="flex-1 rounded border border-slate-300 px-2 py-1"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(a.id)}
                          disabled={isPending(`bed-remove-${a.id}`)}
                          className="flex-1 rounded border border-rose-300 px-2 py-1 text-rose-700 disabled:opacity-60"
                        >
                          {isPending(`bed-remove-${a.id}`) ? "Removing…" : "Delete"}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {(grouped[dept.id] ?? []).length === 0 ? <p className="text-xs text-slate-500">No assignments yet.</p> : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </CanDo>
  );
}
