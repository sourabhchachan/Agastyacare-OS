"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/feedback/ToastProvider";
import { humanizeResponseError } from "@/lib/feedback/humanizeError";
import { useAsyncAction } from "@/lib/feedback/useAsyncAction";
import { UserFacingError } from "@/lib/feedback/userFacingError";

export default function ProfilePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { run, isPending } = useAsyncAction();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/auth/context", { cache: "no-store" });
      if (!res.ok) {
        showToast("error", await humanizeResponseError(res));
        setLoading(false);
        return;
      }
      const data = (await res.json()) as {
        profile?: { fullName?: string; staffId?: string } | null;
        departments?: string[];
        permissions?: string[];
      };
      setName(data.profile?.fullName ?? "User");
      setLoginId(data.profile?.staffId ?? "");
      setDepartments(data.departments ?? []);
      setPermissions(data.permissions ?? []);
      setLoading(false);
    };
    void load();
  }, [showToast]);

  const handleLogout = () => {
    void run(
      "logout",
      async () => {
        const supabase = createClient();
        const { error } = await supabase.auth.signOut();
        if (error) throw new UserFacingError(error.message);
        router.push("/login");
      },
      { successMessage: "Signed out" }
    );
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
        type="button"
        onClick={handleLogout}
        disabled={isPending("logout")}
        className="min-h-11 w-full rounded-xl bg-[#1B4F8A] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isPending("logout") ? "Signing out…" : "Log out"}
      </button>
    </section>
  );
}
