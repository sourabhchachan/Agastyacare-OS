"use client";

import * as XLSX from "xlsx";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CanDo } from "@/components/CanDo";
import { PERMISSIONS } from "@/lib/auth/permissions";

type StaffUser = {
  id: string;
  staff_id: string;
  full_name: string;
  is_active: boolean;
};

type Department = {
  id: string;
  name: string;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [staffId, setStaffId] = useState("");
  const [fullName, setFullName] = useState("");
  const [pin, setPin] = useState("");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);

  const loadData = async () => {
    const supabase = createClient();
    const [{ data: usersData }, { data: departmentsData }] = await Promise.all([
      supabase.from("staff_users").select("id, staff_id, full_name, is_active").order("created_at", { ascending: false }),
      supabase.from("departments").select("id, name").eq("is_active", true),
    ]);

    setUsers(usersData ?? []);
    setDepartments(departmentsData ?? []);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const createUser = async () => {
    await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId, fullName, pin, departmentIds: selectedDepartments }),
    });

    setStaffId("");
    setFullName("");
    setPin("");
    setSelectedDepartments([]);
    await loadData();
  };

  const toggleActive = async (userId: string, isActive: boolean) => {
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isActive: !isActive }),
    });

    await loadData();
  };

  const handleExcelUpload = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

    const normalized = rows.map((row) => ({
      staffId: String(row.staffId ?? row.staff_id ?? ""),
      fullName: String(row.fullName ?? row.full_name ?? ""),
      pin: String(row.pin ?? ""),
      departmentIds: String(row.departmentIds ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    }));

    await fetch("/api/admin/users/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: normalized }),
    });

    await loadData();
  };

  const downloadTemplate = () => {
    const templateRows = [
      {
        staffId: "",
        fullName: "",
        pin: "",
        departmentIds: "",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateRows, {
      header: ["staffId", "fullName", "pin", "departmentIds"],
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "UsersTemplate");
    XLSX.writeFile(workbook, "agastya-users-upload-template.xlsx");
  };

  return (
    <CanDo permission={PERMISSIONS.ADMIN_USERS_VIEW} fallback={<p className="text-sm text-slate-600">No access.</p>}>
      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-[#1B4F8A]">Admin - Users</h1>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Link href="/admin/departments" className="rounded-lg border border-slate-300 px-2 py-2 text-center">Departments</Link>
          <Link href="/admin/framework" className="rounded-lg border border-slate-300 px-2 py-2 text-center">Framework</Link>
          <Link href="/admin/catalogue" className="rounded-lg border border-slate-300 px-2 py-2 text-center">Catalogue</Link>
          <Link href="/admin/vendors" className="rounded-lg border border-slate-300 px-2 py-2 text-center">Vendors</Link>
          <Link href="/admin/bed-assignments" className="rounded-lg border border-slate-300 px-2 py-2 text-center">Bed Assignments</Link>
          <Link href="/admin/handover" className="rounded-lg border border-slate-300 px-2 py-2 text-center">Handover</Link>
          <Link href="/admin/facility-item" className="rounded-lg border border-slate-300 px-2 py-2 text-center">Facility item</Link>
          <CanDo permission={PERMISSIONS.ACCESS_FINANCIAL_DATA}>
            <Link href="/admin/billing" className="rounded-lg border border-slate-300 px-2 py-2 text-center">Billing</Link>
          </CanDo>
          <CanDo permission={PERMISSIONS.BUILD_SYSTEM}>
            <Link href="/admin/audit" className="rounded-lg border border-slate-300 px-2 py-2 text-center">Audit Logs</Link>
          </CanDo>
        </div>

        <CanDo permission={PERMISSIONS.ADMIN_USERS_MANAGE}>
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <h2 className="text-sm font-semibold">Add user</h2>
            <input
              placeholder="10-digit staff ID"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value.replace(/\D/g, "").slice(0, 10))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="4-digit PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />

            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-600">Departments</p>
              {departments.map((dept) => {
                const checked = selectedDepartments.includes(dept.id);
                return (
                  <label key={dept.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedDepartments((prev) =>
                          checked ? prev.filter((id) => id !== dept.id) : [...prev, dept.id]
                        );
                      }}
                    />
                    {dept.name}
                  </label>
                );
              })}
            </div>

            <button onClick={() => void createUser()} className="w-full rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white">
              Create user
            </button>
          </div>
        </CanDo>

        <CanDo permission={PERMISSIONS.ADMIN_USERS_BULK_IMPORT}>
          <div className="rounded-xl border border-slate-200 p-3">
            <h2 className="text-sm font-semibold">Bulk upload (Excel)</h2>
            <button
              type="button"
              onClick={downloadTemplate}
              className="mt-2 w-full rounded-lg border border-[#1B4F8A] px-3 py-2 text-sm font-semibold text-[#1B4F8A]"
            >
              Download Template
            </button>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="mt-2 w-full text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleExcelUpload(file);
              }}
            />
          </div>
        </CanDo>

        <div className="space-y-2">
          {users.map((user) => (
            <div key={user.id} className="rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-semibold">{user.full_name}</p>
              <p className="text-xs text-slate-600">ID: {user.staff_id}</p>
              <button
                onClick={() => void toggleActive(user.id, user.is_active)}
                className={`mt-2 rounded-lg px-3 py-1 text-xs font-semibold ${
                  user.is_active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                }`}
              >
                {user.is_active ? "Set inactive" : "Set active"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </CanDo>
  );
}
