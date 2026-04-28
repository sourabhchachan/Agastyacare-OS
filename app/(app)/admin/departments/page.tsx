"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CanDo } from "@/components/CanDo";
import { PERMISSIONS } from "@/lib/auth/permissions";

type Permission = { id: string; code: string; name: string };
type Department = { id: string; code: string; name: string; description: string | null };

type ExistingDeptPermission = { department_id: string; permission_id: string };

export default function AdminDepartmentsPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentPermissions, setDepartmentPermissions] = useState<Record<string, string[]>>({});

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);

  const loadData = async () => {
    const supabase = createClient();

    const [{ data: permissionsData }, { data: departmentsData }, { data: deptPermissionsData }] = await Promise.all([
      supabase.from("permissions").select("id, code, name").order("code"),
      supabase.from("departments").select("id, code, name, description").order("name"),
      supabase.from("department_permissions").select("department_id, permission_id"),
    ]);

    const map: Record<string, string[]> = {};
    (deptPermissionsData as ExistingDeptPermission[] | null)?.forEach((row) => {
      if (!map[row.department_id]) {
        map[row.department_id] = [];
      }
      map[row.department_id].push(row.permission_id);
    });

    setPermissions(permissionsData ?? []);
    setDepartments(departmentsData ?? []);
    setDepartmentPermissions(map);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const createDepartment = async () => {
    await fetch("/api/admin/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name, description, permissionIds: selectedPermissionIds }),
    });

    setCode("");
    setName("");
    setDescription("");
    setSelectedPermissionIds([]);
    await loadData();
  };

  const saveDepartmentPermissions = async (departmentId: string, permissionIds: string[]) => {
    await fetch("/api/admin/departments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentId, permissionIds }),
    });

    await loadData();
  };

  return (
    <CanDo
      permission={PERMISSIONS.ADMIN_DEPARTMENTS_VIEW}
      fallback={<p className="text-sm text-slate-600">No access.</p>}
    >
      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-[#1B4F8A]">Admin - Departments</h1>

        <CanDo permission={PERMISSIONS.ADMIN_DEPARTMENTS_MANAGE}>
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <h2 className="text-sm font-semibold">Create department</h2>
            <input
              placeholder="Department code"
              value={code}
              onChange={(e) => setCode(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Department name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />

            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-600">Assign permissions</p>
              {permissions.map((permission) => {
                const checked = selectedPermissionIds.includes(permission.id);
                return (
                  <label key={permission.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedPermissionIds((prev) =>
                          checked ? prev.filter((id) => id !== permission.id) : [...prev, permission.id]
                        );
                      }}
                    />
                    {permission.code}
                  </label>
                );
              })}
            </div>

            <button
              onClick={() => void createDepartment()}
              className="w-full rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white"
            >
              Create department
            </button>
          </div>
        </CanDo>

        <div className="space-y-3">
          {departments.map((department) => {
            const activePermissionIds = departmentPermissions[department.id] ?? [];

            return (
              <div key={department.id} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-semibold">{department.name}</p>
                <p className="text-xs text-slate-600">{department.code}</p>

                <CanDo permission={PERMISSIONS.ADMIN_DEPARTMENTS_MANAGE}>
                  <div className="mt-2 space-y-1">
                    {permissions.map((permission) => {
                      const checked = activePermissionIds.includes(permission.id);
                      return (
                        <label key={permission.id} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? activePermissionIds.filter((id) => id !== permission.id)
                                : [...activePermissionIds, permission.id];

                              void saveDepartmentPermissions(department.id, next);
                            }}
                          />
                          {permission.code}
                        </label>
                      );
                    })}
                  </div>
                </CanDo>
              </div>
            );
          })}
        </div>
      </section>
    </CanDo>
  );
}
