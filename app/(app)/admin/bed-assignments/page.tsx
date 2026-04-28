"use client";

import { useEffect, useMemo, useState } from "react";
import { CanDo } from "@/components/CanDo";
import { PERMISSIONS } from "@/lib/auth/permissions";

type Department = { id: string; name: string };
type Staff = { id: string; full_name: string; is_active: boolean };
type Assignment = {
  id: string;
  dept_id: string;
  assigned_user_id: string;
  bed_range_start: string;
  bed_range_end: string;
};

export default function BedAssignmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<Staff[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [deptId, setDeptId] = useState("");
  const [userId, setUserId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const loadData = async () => {
    const response = await fetch("/api/admin/bed-assignments");
    const result = (await response.json()) as { departments: Department[]; users: Staff[]; assignments: Assignment[] };
    setDepartments(result.departments ?? []);
    setUsers(result.users ?? []);
    setAssignments(result.assignments ?? []);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, Assignment[]> = {};
    assignments.forEach((a) => {
      if (!map[a.dept_id]) map[a.dept_id] = [];
      map[a.dept_id].push(a);
    });
    return map;
  }, [assignments]);

  const save = async () => {
    await fetch("/api/admin/bed-assignments", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { id: editingId, assigned_user_id: userId, bed_range_start: start, bed_range_end: end } : { dept_id: deptId, assigned_user_id: userId, bed_range_start: start, bed_range_end: end }),
    });
    setEditingId(null);
    setDeptId("");
    setUserId("");
    setStart("");
    setEnd("");
    await loadData();
  };

  const remove = async (id: string) => {
    await fetch("/api/admin/bed-assignments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadData();
  };

  return (
    <CanDo permission={PERMISSIONS.MANAGE_USERS} fallback={<p className="text-sm text-slate-600">No access.</p>}>
      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-[#1B4F8A]">Admin - Bed Assignments</h1>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <h2 className="text-sm font-semibold">{editingId ? "Edit assignment" : "Assign beds"}</h2>
          {!editingId ? (
            <select value={deptId} onChange={(e) => setDeptId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Select department</option>
              {departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
            </select>
          ) : null}
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Select active user</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="Start" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="End" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button type="button" onClick={() => void save()} className="w-full rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white">Save</button>
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
                        <button type="button" onClick={() => { setEditingId(a.id); setDeptId(a.dept_id); setUserId(a.assigned_user_id); setStart(a.bed_range_start); setEnd(a.bed_range_end); }} className="flex-1 rounded border border-slate-300 px-2 py-1">Edit</button>
                        <button type="button" onClick={() => void remove(a.id)} className="flex-1 rounded border border-rose-300 px-2 py-1 text-rose-700">Delete</button>
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
