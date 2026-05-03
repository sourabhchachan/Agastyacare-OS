"use client";

import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CanDo } from "@/components/CanDo";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { humanizeError, humanizeResponseError } from "@/lib/feedback/humanizeError";
import { useAsyncAction } from "@/lib/feedback/useAsyncAction";
import { UserFacingError } from "@/lib/feedback/userFacingError";
import { useToast } from "@/components/feedback/ToastProvider";

type StaffUser = {
  id: string;
  staff_id: string;
  login_id: string | null;
  full_name: string;
  is_active: boolean;
};

type Department = {
  id: string;
  name: string;
};

export default function AdminUsersPage() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [fullName, setFullName] = useState("");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [createFormError, setCreateFormError] = useState<string | null>(null);
  const [bulkSummary, setBulkSummary] = useState<{
    createdCount: number;
    failedCount: number;
    failures: Array<{ row: number; fullName: string; departmentName: string; reason: string }>;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "name" | "staff_id" | "status">("newest");
  const { run, isPending } = useAsyncAction();

  const [editUser, setEditUser] = useState<StaffUser | null>(null);
  const [editLoginId, setEditLoginId] = useState("");
  const [editLoginError, setEditLoginError] = useState<string | null>(null);
  const [savingLoginId, setSavingLoginId] = useState(false);

  const loadData = async () => {
    const supabase = createClient();
    const [{ data: usersData }, { data: departmentsData }] = await Promise.all([
      supabase.from("staff_users").select("id, staff_id, login_id, full_name, is_active").order("created_at", { ascending: false }),
      supabase.from("departments").select("id, name").eq("is_active", true),
    ]);

    setUsers(usersData ?? []);
    setDepartments(departmentsData ?? []);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const createUser = () => {
    setCreateFormError(null);
    void run(
      "create-user",
      async () => {
        const response = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fullName, departmentIds: selectedDepartments }),
        });
        if (!response.ok) {
          const msg = await humanizeResponseError(response);
          if (msg.includes("already exists")) setCreateFormError(msg);
          throw new UserFacingError(msg);
        }

        setFullName("");
        setSelectedDepartments([]);
        setCreateFormError(null);
        await loadData();
      },
      { successMessage: "User created" }
    );
  };

  const toggleActive = (userId: string, isActive: boolean) => {
    void run(
      `user-toggle-${userId}`,
      async () => {
        const res = await fetch("/api/admin/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, isActive: !isActive }),
        });
        if (!res.ok) throw new UserFacingError(await humanizeResponseError(res));
        await loadData();
      },
      { successMessage: isActive ? "User deactivated" : "User reactivated" }
    );
  };

  const handleExcelUpload = (file: File) => {
    void run(
      "users-bulk",
      async () => {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

        const normalized = rows.map((row) => ({
          fullName: String(row.fullName ?? row.full_name ?? row["Full name"] ?? ""),
          departmentName: String(
            row.departmentName ?? row.department_name ?? row["Department Name"] ?? row["Department name"] ?? ""
          ),
        }));

        const res = await fetch("/api/admin/users/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: normalized }),
        });
        if (!res.ok) throw new UserFacingError(await humanizeResponseError(res));
        const result = (await res.json()) as {
          createdCount: number;
          failedCount: number;
          failures: Array<{ row: number; fullName: string; departmentName: string; reason: string }>;
        };
        setBulkSummary({
          createdCount: result.createdCount,
          failedCount: result.failedCount,
          failures: result.failures ?? [],
        });
        showToast(
          "success",
          `${result.createdCount} users created, ${result.failedCount} rows failed`
        );
        await loadData();
      },
      { successMessage: null }
    );
  };

  const downloadTemplate = () => {
    const templateRows = [
      {
        fullName: "",
        departmentName: "",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateRows, {
      header: ["fullName", "departmentName"],
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "UsersTemplate");
    XLSX.writeFile(workbook, "agastya-users-upload-template.xlsx");
  };

  const openEditLogin = (user: StaffUser) => {
    setEditUser(user);
    setEditLoginId((user.login_id ?? user.staff_id).trim());
    setEditLoginError(null);
  };

  const closeEditLogin = () => {
    setEditUser(null);
    setEditLoginId("");
    setEditLoginError(null);
  };

  const saveLoginId = async () => {
    if (!editUser || savingLoginId) return;
    const trimmed = editLoginId.trim();
    if (!trimmed) {
      setEditLoginError("Login ID cannot be empty.");
      return;
    }
    setEditLoginError(null);
    setSavingLoginId(true);
    try {
      const supabase = createClient();
      const { data: taken } = await supabase
        .from("staff_users")
        .select("id")
        .eq("login_id", trimmed)
        .neq("id", editUser.id)
        .maybeSingle();

      if (taken) {
        setEditLoginError("This Login ID is already in use by another user.");
        return;
      }

      const { error } = await supabase.from("staff_users").update({ login_id: trimmed }).eq("id", editUser.id);

      if (error) {
        if (error.code === "23505") {
          setEditLoginError("This Login ID is already in use by another user.");
        } else {
          showToast("error", humanizeError(error));
        }
        return;
      }

      showToast("success", "Login ID updated");
      closeEditLogin();
      await loadData();
    } finally {
      setSavingLoginId(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = users.filter((user) => {
      if (!q) return true;
      return (
        user.full_name.toLowerCase().includes(q) ||
        user.staff_id.toLowerCase().includes(q) ||
        (user.login_id ?? user.staff_id).toLowerCase().includes(q)
      );
    });

    return [...base].sort((a, b) => {
      if (sortBy === "name") return a.full_name.localeCompare(b.full_name);
      if (sortBy === "staff_id") return a.staff_id.localeCompare(b.staff_id);
      if (sortBy === "status") {
        const av = a.is_active ? 0 : 1;
        const bv = b.is_active ? 0 : 1;
        if (av !== bv) return av - bv;
        return a.full_name.localeCompare(b.full_name);
      }
      return 0;
    });
  }, [users, search, sortBy]);

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
            <p className="text-xs text-slate-500">
              Staff ID is assigned automatically. New accounts use PIN <span className="font-mono">000000</span> until
              the user changes it at first sign-in.
            </p>
            <input
              placeholder="Full name"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setCreateFormError(null);
              }}
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
                        setCreateFormError(null);
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

            {createFormError ? (
              <p className="text-xs text-rose-600" role="alert">
                {createFormError}
              </p>
            ) : null}

            <button
              type="button"
              onClick={createUser}
              disabled={isPending("create-user")}
              className="w-full rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isPending("create-user") ? "Creating…" : "Create user"}
            </button>
          </div>
        </CanDo>

        <CanDo permission={PERMISSIONS.ADMIN_USERS_BULK_IMPORT}>
          <div className="rounded-xl border border-slate-200 p-3">
            <h2 className="text-sm font-semibold">Bulk upload (Excel)</h2>
            <p className="mt-1 text-xs text-slate-500">
              Columns: <span className="font-medium">fullName</span>, <span className="font-medium">departmentName</span>{" "}
              (must match an active department). Staff ID and PIN are set automatically (PIN <span className="font-mono">000000</span>).
            </p>
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
                if (file) handleExcelUpload(file);
              }}
              disabled={isPending("users-bulk")}
            />
            {bulkSummary ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
                <p className="font-semibold text-slate-800">
                  {bulkSummary.createdCount} users created, {bulkSummary.failedCount} rows failed
                </p>
                {bulkSummary.failures.length > 0 ? (
                  <ul className="mt-2 max-h-40 list-inside list-disc space-y-1 overflow-y-auto text-slate-700">
                    {bulkSummary.failures.map((f) => (
                      <li key={`${f.row}-${f.reason}`}>
                        Row {f.row}
                        {f.fullName ? ` (${f.fullName})` : ""}: {f.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        </CanDo>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <h2 className="text-sm font-semibold">User list</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, staff ID, or login ID"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "newest" | "name" | "staff_id" | "status")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="newest">Newest first</option>
            <option value="name">Name (A-Z)</option>
            <option value="staff_id">Staff ID</option>
            <option value="status">Active first</option>
          </select>
        </div>

        <div className="space-y-2">
          {filteredUsers.map((user) => (
            <div key={user.id} className="rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-semibold">{user.full_name}</p>
              <p className="text-xs text-slate-600">Staff ID: {user.staff_id}</p>
              <p className="text-xs text-slate-600">Login ID: {user.login_id ?? user.staff_id}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <CanDo permission={PERMISSIONS.ADMIN_USERS_MANAGE}>
                  <button
                    type="button"
                    onClick={() => openEditLogin(user)}
                    className="rounded-lg border border-[#1B4F8A] px-3 py-1 text-xs font-semibold text-[#1B4F8A]"
                  >
                    Edit login ID
                  </button>
                </CanDo>
                <button
                  type="button"
                  onClick={() => toggleActive(user.id, user.is_active)}
                  disabled={isPending(`user-toggle-${user.id}`)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold disabled:opacity-60 ${
                    user.is_active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {isPending(`user-toggle-${user.id}`)
                    ? "Updating…"
                    : user.is_active
                      ? "Set inactive"
                      : "Set active"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {editUser ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
            <div
              role="dialog"
              aria-labelledby="edit-login-title"
              className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
            >
              <h2 id="edit-login-title" className="text-sm font-semibold text-[#1B4F8A]">
                Edit login ID
              </h2>
              <p className="mt-1 text-xs text-slate-600">{editUser.full_name}</p>
              <label className="mt-3 block text-xs font-medium text-slate-700">
                Login ID
                <input
                  value={editLoginId}
                  onChange={(e) => {
                    setEditLoginId(e.target.value);
                    setEditLoginError(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  autoComplete="off"
                  disabled={savingLoginId}
                />
              </label>
              {editLoginError ? (
                <p className="mt-2 text-xs text-rose-600" role="alert">
                  {editLoginError}
                </p>
              ) : null}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => void saveLoginId()}
                  disabled={savingLoginId}
                  className="flex-1 rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {savingLoginId ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={closeEditLogin}
                  disabled={savingLoginId}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </CanDo>
  );
}
