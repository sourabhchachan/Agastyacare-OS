"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const [{ data: staff }, { data: deps }, { data: perms }] = await Promise.all([
        supabase.from("staff_users").select("full_name, staff_id").eq("id", user.id).maybeSingle(),
        supabase
          .from("user_departments")
          .select("departments(name)")
          .eq("user_id", user.id),
        supabase.rpc("current_user_permissions"),
      ]);
      setName((staff as { full_name?: string } | null)?.full_name ?? "User");
      setLoginId((staff as { staff_id?: string } | null)?.staff_id ?? "");
      setDepartments(
        (deps ?? [])
          .map((d) => {
            const row = d as { departments: { name: string } | { name: string }[] | null };
            const rel = Array.isArray(row.departments) ? row.departments[0] : row.departments;
            return rel?.name ?? "";
          })
          .filter(Boolean)
      );
      setPermissions(
        (perms ?? []).map((p: { permission_code?: string }) => p.permission_code ?? "").filter(Boolean)
      );
      setLoading(false);
    };
    void load();
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold text-[#1B4F8A]">Profile</h1>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />)}
        </div>
      ) : (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm">
          <p><span className="font-semibold">Name:</span> {name}</p>
          <p><span className="font-semibold">Login ID:</span> {loginId}</p>
          <p><span className="font-semibold">Departments:</span> {departments.join(", ") || "-"}</p>
          <p><span className="font-semibold">Permissions:</span> {permissions.join(", ") || "-"}</p>
        </div>
      )}
      <Link
        href="/change-pin"
        className="block min-h-11 w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-sm font-semibold text-slate-800"
      >
        Change PIN
      </Link>
      <Link
        href="/shift-summary"
        className="block min-h-11 w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-sm font-semibold text-slate-800"
      >
        Shift Summary
      </Link>
      <button
        onClick={() => void handleLogout()}
        className="min-h-11 w-full rounded-xl bg-[#1B4F8A] px-4 py-3 text-sm font-semibold text-white"
      >
        Log out
      </button>
    </section>
  );
}
