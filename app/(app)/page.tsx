"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePermissions } from "@/lib/auth/usePermissions";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { useToast } from "@/components/feedback/ToastProvider";
import { humanizeError } from "@/lib/feedback/humanizeError";
import { useAsyncAction } from "@/lib/feedback/useAsyncAction";

type InstanceRow = {
  id: string;
  due_at: string;
  patient_id: string | null;
  catalogue_item_id: string;
  status: string;
  item_name: string;
  sub_task_name: string;
  patients: { name: string; bed_number: string; priority: string } | null;
};

/** Row shape from `get_queue_instances` RPC (subset of item_instances). */
type QueueInstanceRpc = {
  id: string;
  due_at: string;
  patient_id: string | null;
  catalogue_item_id: string;
  status: string;
};

type PendingCheckpointRow = {
  instance_id: string;
  step_number: number;
  status: string;
  department_id: string | null;
  assigned_user_id: string | null;
};

const priorityRank: Record<string, number> = { critical: 0, moderate: 1, stable: 2 };

function formatOverdue(dueAt: string): string {
  const d = new Date(dueAt).getTime();
  const diff = Date.now() - d;
  if (diff <= 0) return "";
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return `${h}hr ${min}min overdue`;
  return `${min}min overdue`;
}

function sortQueue(a: InstanceRow, b: InstanceRow): number {
  const da = new Date(a.due_at).getTime();
  const db = new Date(b.due_at).getTime();
  const overA = da < Date.now() ? 0 : 1;
  const overB = db < Date.now() ? 0 : 1;
  if (overA !== overB) return overA - overB;
  const pa = a.patients ? priorityRank[a.patients.priority] ?? 3 : 4;
  const pb = b.patients ? priorityRank[b.patients.priority] ?? 3 : 4;
  if (pa !== pb) return pa - pb;
  if (da !== db) return da - db;
  const fa = a.patient_id ? 0 : 1;
  const fb = b.patient_id ? 0 : 1;
  return fa - fb;
}

function splitNowNext(items: InstanceRow[]) {
  const now = Date.now();
  const h1 = 60 * 60 * 1000;
  const h4 = 4 * 60 * 60 * 1000;
  const nowList: InstanceRow[] = [];
  const nextList: InstanceRow[] = [];
  for (const it of items) {
    const d = new Date(it.due_at).getTime();
    if (d < now || (d >= now && d <= now + h1)) nowList.push(it);
    else if (d > now + h1 && d <= now + h4) nextList.push(it);
  }
  nowList.sort(sortQueue);
  nextList.sort(sortQueue);
  return { nowList, nextList };
}

export default function HomeQueuePage() {
  const { can, loading: permLoad } = usePermissions();
  const { showToast } = useToast();
  const { run, isPending } = useAsyncAction();
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<InstanceRow[]>([]);
  const [nextDesc, setNextDesc] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pullStartY, setPullStartY] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: userDepts } = await supabase
      .from("user_departments")
      .select("department_id")
      .eq("user_id", user.id);
    const userDeptSet = new Set((userDepts ?? []).map((d) => d.department_id));
    const { data: insts, error } = await supabase.rpc("get_queue_instances");
    if (error) {
      setError(error.message);
      showToast("error", humanizeError(new Error(error.message)));
      setLoading(false);
      return;
    }
    const base = (insts ?? []) as QueueInstanceRpc[];
    const catIds = Array.from(new Set(base.map((i) => i.catalogue_item_id)));
    const patIds = Array.from(
      new Set(base.map((i) => i.patient_id).filter(Boolean))
    ) as string[];
    const [catsRes, patsRes] = await Promise.all([
      catIds.length > 0
        ? supabase.from("item_catalogue").select("id, name").in("id", catIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] | null }),
      patIds.length > 0
        ? supabase.from("patients").select("id, name, bed_number, priority").in("id", patIds)
        : Promise.resolve({ data: [] as { id: string; name: string; bed_number: string; priority: string }[] | null }),
    ]);
    const cats = catsRes.data;
    const pats = patsRes.data;
    const catBy = new Map((cats ?? []).map((c) => [c.id, c.name]));
    const patBy = new Map((pats ?? []).map((p) => [p.id, p]));
    const list: InstanceRow[] = base.map((i) => ({
      id: i.id,
      due_at: i.due_at,
      patient_id: i.patient_id,
      catalogue_item_id: i.catalogue_item_id,
      status: i.status,
      item_name: catBy.get(i.catalogue_item_id) ?? "Item",
      sub_task_name: "",
      patients: i.patient_id ? patBy.get(i.patient_id) ?? null : null,
    }));

    if (list.length === 0) {
      setRows([]);
      setNextDesc({});
      setLoading(false);
      return;
    }
    const ids = list.map((r) => r.id);
    const { data: cps } = await supabase
      .from("item_checkpoint_instances")
      .select("instance_id, step_number, status, department_id, assigned_user_id")
      .in("instance_id", ids)
      .eq("status", "pending");
    const { data: defs } = await supabase
      .from("item_checkpoint_definitions")
      .select("catalogue_item_id, step_number, description")
      .in("catalogue_item_id", catIds);
    const defByCat = new Map<string, Map<number, string>>();
    for (const d of defs ?? []) {
      if (!defByCat.has(d.catalogue_item_id)) defByCat.set(d.catalogue_item_id, new Map());
      defByCat.get(d.catalogue_item_id)!.set(d.step_number, d.description);
    }
    const pendingByInst = new Map<string, PendingCheckpointRow>();
    for (const c of (cps ?? []) as PendingCheckpointRow[]) {
      const cur = pendingByInst.get(c.instance_id);
      if (!cur || c.step_number < cur.step_number) {
        pendingByInst.set(c.instance_id, c);
      }
    }
    const desc: Record<string, string> = {};
    const filtered = list.filter((r) => {
      const pending = pendingByInst.get(r.id);
      if (!pending) return false;
      if (pending.assigned_user_id) return pending.assigned_user_id === user.id;
      if (pending.department_id) return userDeptSet.has(pending.department_id);
      return true;
    });
    const listWithSubtasks = filtered.map((r) => {
      const pending = pendingByInst.get(r.id);
      const step = pending?.step_number;
      const taskName = step === undefined ? "" : defByCat.get(r.catalogue_item_id)?.get(step) ?? "";
      return { ...r, sub_task_name: taskName };
    });
    for (const r of listWithSubtasks) {
      if (!r.sub_task_name) {
        desc[r.id] = "";
        continue;
      }
      desc[r.id] = r.sub_task_name;
    }
    setRows(listWithSubtasks);
    setNextDesc(desc);
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const debounced = () => {
      if (loadDebounceRef.current) clearTimeout(loadDebounceRef.current);
      loadDebounceRef.current = setTimeout(() => {
        loadDebounceRef.current = null;
        void load();
      }, 450);
    };
    const channel = supabase
      .channel("item_instances_queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "item_instances" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "item_checkpoint_instances" }, debounced)
      .subscribe();
    return () => {
      if (loadDebounceRef.current) clearTimeout(loadDebounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const { nowList, nextList } = useMemo(() => splitNowNext(rows), [rows]);

  const renderCard = (r: InstanceRow) => {
    const due = new Date(r.due_at);
    const overdue = due.getTime() < Date.now();
    const badge =
      r.patients?.priority === "critical"
        ? "🔴"
        : r.patients?.priority === "moderate"
          ? "🟡"
          : r.patients
            ? "🟢"
            : "";
    const od = overdue ? formatOverdue(r.due_at) : "";
    return (
      <Link
        key={r.id}
        href={`/items/${r.id}`}
        className={`block rounded-xl border p-3 transition-colors active:bg-slate-50 ${
          overdue ? "border-l-4 border-l-red-600 border-slate-200" : "border-slate-200"
        }`}
      >
        <p className="text-sm font-semibold text-slate-900">{r.sub_task_name || r.item_name}</p>
        <p className="text-xs text-slate-600">Item: {r.item_name}</p>
        {r.patients ? (
          <p className="text-xs text-slate-600">
            {badge} {r.patients.name} · Bed {r.patients.bed_number}
          </p>
        ) : (
          <p className="text-xs font-medium text-[#1B4F8A]">Facility</p>
        )}
        <p className={`mt-1 text-xs ${overdue ? "text-red-600" : "text-slate-500"}`}>
          Due {due.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {od ? <span className="font-medium"> · {od}</span> : null}
        </p>
        {nextDesc[r.id] ? <p className="mt-1 text-xs text-slate-600">Sub-task: {nextDesc[r.id]}</p> : null}
      </Link>
    );
  };

  const skeleton = (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      ))}
    </div>
  );

  return (
    <section
      className="space-y-4"
      onTouchStart={(e) => {
        if (window.scrollY === 0) {
          setPullStartY(e.touches[0]?.clientY ?? null);
        }
      }}
      onTouchMove={(e) => {
        if (pullStartY === null) return;
        const y = e.touches[0]?.clientY ?? 0;
        const d = Math.max(0, Math.min(120, y - pullStartY));
        setPullDistance(d);
      }}
      onTouchEnd={() => {
        if (pullDistance > 80) {
          void run(
            "queue-refresh",
            async () => {
              await load();
            },
            { successMessage: "Queue updated" }
          );
        }
        setPullStartY(null);
        setPullDistance(0);
      }}
    >
      {pullDistance > 0 ? (
        <p className="text-center text-xs text-slate-500">
          {pullDistance > 80 ? "Release to refresh" : "Pull to refresh"}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-[#1B4F8A]">Queue</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              void run(
                "queue-refresh",
                async () => {
                  await load();
                },
                { successMessage: "Queue updated" }
              )
            }
            disabled={isPending("queue-refresh") || loading}
            className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
          >
            {isPending("queue-refresh") || loading ? "Refreshing…" : "Refresh"}
          </button>
          {!permLoad && can(PERMISSIONS.RAISE_ITEMS) ? (
            <Link href="/raise-item" className="min-h-11 rounded-lg px-3 py-2 text-xs font-semibold text-[#1B4F8A]">
            Raise
            </Link>
          ) : null}
          {!permLoad && can(PERMISSIONS.RAISE_ITEMS) ? (
            <Link
              href="/my-raised-items"
              className="min-h-11 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 border border-slate-300"
            >
              My Raised Items
            </Link>
          ) : null}
        </div>
      </div>
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
      <div>
        <h2 className="text-sm font-semibold text-slate-700">Now</h2>
        <div className="mt-2 space-y-2">
          {loading ? skeleton : null}
          {!loading && nowList.length === 0 ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              All clear. No pending items.
            </p>
          ) : null}
          {nowList.map(renderCard)}
        </div>
      </div>
      <div>
        <h2 className="text-sm font-semibold text-slate-700">Next (4 hours)</h2>
        <div className="mt-2 space-y-2">
          {loading ? skeleton : null}
          {!loading && nextList.length === 0 ? <p className="text-sm text-slate-500">No upcoming items in this window.</p> : null}
          {nextList.map(renderCard)}
        </div>
      </div>
    </section>
  );
}
