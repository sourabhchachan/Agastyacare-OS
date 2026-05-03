"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CanDo } from "@/components/CanDo";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/feedback/ToastProvider";
import { humanizeError } from "@/lib/feedback/humanizeError";
import { UserFacingError } from "@/lib/feedback/userFacingError";
import { useAsyncAction } from "@/lib/feedback/useAsyncAction";

type MyRaisedRow = {
  id: string;
  created_at: string;
  patient_id: string | null;
  catalogue_item_id: string;
  status: string;
  item_name: string;
  patient_name: string | null;
};

function formatRaisedStatus(status: string): string {
  switch (status) {
    case "in_progress":
      return "in-progress";
    case "not_done":
      return "not done";
    default:
      return status;
  }
}

export default function MyRaisedItemsPage() {
  const { showToast } = useToast();
  const { run, isPending } = useAsyncAction();
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<MyRaisedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMyRaised = useCallback(
    async (uid: string) => {
      setError(null);
      setLoading(true);

      const supabase = createClient();
      const { data: insts, error: e1 } = await supabase
        .from("item_instances")
        .select("id, created_at, patient_id, catalogue_item_id, status")
        .eq("created_by", uid)
        .order("created_at", { ascending: false });

      if (e1) {
        const msg = humanizeError(e1);
        setError(msg);
        setLoading(false);
        throw new UserFacingError(msg);
      }

      const base = insts ?? [];
      const catIds = Array.from(new Set(base.map((i) => i.catalogue_item_id)));
      const patIds = Array.from(new Set(base.map((i) => i.patient_id).filter(Boolean))) as string[];

      let cats: Array<{ id: string; name: string }> = [];
      if (catIds.length > 0) {
        const { data, error: catErr } = await supabase.from("item_catalogue").select("id, name").in("id", catIds);
        if (catErr) {
          const msg = humanizeError(catErr);
          setError(msg);
          setLoading(false);
          throw new UserFacingError(msg);
        }
        cats = data ?? [];
      }

      let pats: Array<{ id: string; name: string }> = [];
      if (patIds.length > 0) {
        const { data, error: patErr } = await supabase.from("patients").select("id, name").in("id", patIds);
        if (patErr) {
          const msg = humanizeError(patErr);
          setError(msg);
          setLoading(false);
          throw new UserFacingError(msg);
        }
        pats = data ?? [];
      }

      const catBy = new Map(cats.map((c) => [c.id, c.name]));
      const patBy = new Map(pats.map((p) => [p.id, p.name]));

      setRows(
        base.map((i) => ({
          id: i.id,
          created_at: i.created_at,
          patient_id: i.patient_id,
          catalogue_item_id: i.catalogue_item_id,
          status: i.status,
          item_name: catBy.get(i.catalogue_item_id) ?? "Item",
          patient_name: i.patient_id ? patBy.get(i.patient_id) ?? null : null,
        }))
      );

      setLoading(false);
    },
    []
  );

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      try {
        await loadMyRaised(user.id);
      } catch (e) {
        showToast("error", humanizeError(e));
      }
    })();
  }, [loadMyRaised, showToast]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();

    const channel = supabase
      .channel("my_raised_items")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "item_instances", filter: `created_by=eq.${userId}` },
        () => {
          void (async () => {
            try {
              await loadMyRaised(userId);
            } catch (e) {
              showToast("error", humanizeError(e));
            }
          })();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, loadMyRaised, showToast]);

  const refresh = () => {
    if (!userId) return;
    void run(
      "my-raised-refresh",
      async () => {
        await loadMyRaised(userId);
      },
      { successMessage: "List updated" }
    );
  };

  return (
    <CanDo permission={PERMISSIONS.RAISE_ITEMS} fallback={<p className="text-sm text-slate-600">No access.</p>}>
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="text-xs text-[#1B4F8A]">
            ← Queue
          </Link>
          <button
            type="button"
            className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
            onClick={refresh}
            disabled={!userId || isPending("my-raised-refresh") || loading}
          >
            {isPending("my-raised-refresh") ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <h1 className="text-xl font-semibold text-[#1B4F8A]">My Raised Items</h1>

        {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}

        <div className="space-y-2">
          {loading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
            ))
          ) : rows.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">No raised items yet.</p>
          ) : (
            rows.map((r) => (
              <Link
                key={r.id}
                href={`/items/${r.id}`}
                className="block rounded-xl border border-slate-200 p-3 transition-colors active:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{r.item_name}</p>
                    {r.patient_name ? (
                      <p className="text-xs text-slate-600">Patient: {r.patient_name}</p>
                    ) : (
                      <p className="text-xs font-medium text-[#1B4F8A]">Facility</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">
                      {new Date(r.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-700">Status: {formatRaisedStatus(r.status)}</p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </CanDo>
  );
}
