"use client";

import { useEffect, useMemo, useState } from "react";
import { CanDo } from "@/components/CanDo";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { humanizeResponseError } from "@/lib/feedback/humanizeError";
import { useAsyncAction } from "@/lib/feedback/useAsyncAction";
import { UserFacingError } from "@/lib/feedback/userFacingError";

type KRA = { id: string; title: string; description: string | null; is_active: boolean };
type KPI = { id: string; title: string; measurement_unit: string | null; kra_id: string; is_active: boolean };
type SOP = { id: string; title: string; description: string | null; kpi_id: string; is_active: boolean };

type NodeSelection =
  | { type: "kra"; id: string }
  | { type: "kpi"; id: string }
  | { type: "sop"; id: string }
  | null;

export default function FrameworkPage() {
  const { run, isPending } = useAsyncAction();
  const [kras, setKras] = useState<KRA[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [sops, setSops] = useState<SOP[]>([]);
  const [selected, setSelected] = useState<NodeSelection>(null);
  const [expandedKra, setExpandedKra] = useState<Record<string, boolean>>({});
  const [expandedKpi, setExpandedKpi] = useState<Record<string, boolean>>({});

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [measurementUnit, setMeasurementUnit] = useState("");

  const [newKraTitle, setNewKraTitle] = useState("");
  const [newKraDescription, setNewKraDescription] = useState("");
  const [newKpiTitle, setNewKpiTitle] = useState("");
  const [newKpiUnit, setNewKpiUnit] = useState("");
  const [newSopTitle, setNewSopTitle] = useState("");
  const [newSopDescription, setNewSopDescription] = useState("");

  const loadData = async () => {
    const response = await fetch("/api/admin/framework");
    if (!response.ok) throw new UserFacingError(await humanizeResponseError(response));
    const result = (await response.json()) as { kras: KRA[]; kpis: KPI[]; sops: SOP[] };
    setKras(result.kras ?? []);
    setKpis(result.kpis ?? []);
    setSops(result.sops ?? []);
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!selected) return;

    if (selected.type === "kra") {
      const node = kras.find((item) => item.id === selected.id);
      setTitle(node?.title ?? "");
      setDescription(node?.description ?? "");
      setMeasurementUnit("");
      return;
    }

    if (selected.type === "kpi") {
      const node = kpis.find((item) => item.id === selected.id);
      setTitle(node?.title ?? "");
      setMeasurementUnit(node?.measurement_unit ?? "");
      setDescription("");
      return;
    }

    const node = sops.find((item) => item.id === selected.id);
    setTitle(node?.title ?? "");
    setDescription(node?.description ?? "");
    setMeasurementUnit("");
  }, [selected, kras, kpis, sops]);

  const selectedLabel = useMemo(() => {
    if (!selected) return "Select a node to edit";
    if (selected.type === "kra") return "Editing Problem";
    if (selected.type === "kpi") return "Editing Indicator";
    return "Editing Solution";
  }, [selected]);

  const addKra = () => {
    void run(
      "add-kra",
      async () => {
        const response = await fetch("/api/admin/framework", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "kra", title: newKraTitle, description: newKraDescription }),
        });
        if (!response.ok) throw new UserFacingError(await humanizeResponseError(response));
        setNewKraTitle("");
        setNewKraDescription("");
        await loadData();
      },
      { successMessage: "Problem created" }
    );
  };

  const addKpi = (kraId: string) => {
    void run(
      `add-kpi-${kraId}`,
      async () => {
        const response = await fetch("/api/admin/framework", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "kpi", kraId, title: newKpiTitle, measurementUnit: newKpiUnit }),
        });
        if (!response.ok) throw new UserFacingError(await humanizeResponseError(response));
        setNewKpiTitle("");
        setNewKpiUnit("");
        await loadData();
      },
      { successMessage: "Indicator created" }
    );
  };

  const addSop = (kpiId: string) => {
    void run(
      `add-sop-${kpiId}`,
      async () => {
        const response = await fetch("/api/admin/framework", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "sop", kpiId, title: newSopTitle, description: newSopDescription }),
        });
        if (!response.ok) throw new UserFacingError(await humanizeResponseError(response));
        setNewSopTitle("");
        setNewSopDescription("");
        await loadData();
      },
      { successMessage: "Solution created" }
    );
  };

  const saveSelected = () => {
    if (!selected) return;
    void run(
      "fw-save",
      async () => {
        const res = await fetch("/api/admin/framework", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            selected.type === "kpi"
              ? { type: selected.type, id: selected.id, title, measurementUnit }
              : { type: selected.type, id: selected.id, title, description }
          ),
        });
        if (!res.ok) throw new UserFacingError(await humanizeResponseError(res));
        await loadData();
      },
      { successMessage: "Saved" }
    );
  };

  const toggleActive = (type: "kra" | "kpi" | "sop", id: string, isActive: boolean) => {
    void run(
      `fw-toggle-${type}-${id}`,
      async () => {
        const response = await fetch("/api/admin/framework", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, id, action: "set_active", is_active: !isActive }),
        });
        if (!response.ok) throw new UserFacingError(await humanizeResponseError(response));
        await loadData();
      },
      { successMessage: isActive ? "Deactivated" : "Reactivated" }
    );
  };

  return (
    <CanDo permission={PERMISSIONS.BUILD_SYSTEM} fallback={<p className="text-sm text-slate-600">No access.</p>}>
      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-[#1B4F8A]">Admin - Framework</h1>

        <div className="rounded-xl border border-slate-200 p-3">
          <h2 className="text-sm font-semibold">Add Problem</h2>
          <div className="mt-2 space-y-2">
            <input value={newKraTitle} onChange={(e) => setNewKraTitle(e.target.value)} placeholder="Problem title" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input value={newKraDescription} onChange={(e) => setNewKraDescription(e.target.value)} placeholder="Problem description" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button
              type="button"
              onClick={addKra}
              disabled={isPending("add-kra")}
              className="w-full rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isPending("add-kra") ? "Creating…" : "Create Problem"}
            </button>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <h2 className="text-sm font-semibold">Problem → Indicator → Solution</h2>
          {kras.map((kra) => {
            const kraKpis = kpis.filter((kpi) => kpi.kra_id === kra.id);
            const kraOpen = expandedKra[kra.id] ?? true;

            return (
              <div key={kra.id} className="rounded-lg border border-slate-200 p-2">
                <button
                  type="button"
                  onClick={() => setExpandedKra((prev) => ({ ...prev, [kra.id]: !kraOpen }))}
                  className="w-full text-left text-sm font-semibold"
                >
                  {kraOpen ? "▼" : "▶"} {kra.title} {!kra.is_active ? "(Inactive)" : ""}
                </button>
                <div className="mt-1 flex gap-2">
                  <button type="button" onClick={() => setSelected({ type: "kra", id: kra.id })} className="text-xs text-[#1B4F8A]">Edit Problem</button>
                  <button
                    type="button"
                    onClick={() => toggleActive("kra", kra.id, kra.is_active)}
                    disabled={isPending(`fw-toggle-kra-${kra.id}`)}
                    className="text-xs text-rose-700 disabled:opacity-50"
                  >
                    {isPending(`fw-toggle-kra-${kra.id}`) ? "Updating…" : kra.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                </div>

                {kraOpen ? (
                  <div className="mt-2 space-y-2 pl-3">
                    {kraKpis.map((kpi) => {
                      const kpiSops = sops.filter((sop) => sop.kpi_id === kpi.id);
                      const kpiOpen = expandedKpi[kpi.id] ?? true;

                      return (
                        <div key={kpi.id} className="rounded-lg border border-slate-200 p-2">
                          <button
                            type="button"
                            onClick={() => setExpandedKpi((prev) => ({ ...prev, [kpi.id]: !kpiOpen }))}
                            className="w-full text-left text-sm"
                          >
                            {kpiOpen ? "▼" : "▶"} {kpi.title} {!kpi.is_active ? "(Inactive)" : ""}
                          </button>
                          <div className="mt-1 flex gap-2">
                            <button type="button" onClick={() => setSelected({ type: "kpi", id: kpi.id })} className="text-xs text-[#1B4F8A]">Edit Indicator</button>
                            <button
                              type="button"
                              onClick={() => toggleActive("kpi", kpi.id, kpi.is_active)}
                              disabled={isPending(`fw-toggle-kpi-${kpi.id}`)}
                              className="text-xs text-rose-700 disabled:opacity-50"
                            >
                              {isPending(`fw-toggle-kpi-${kpi.id}`) ? "Updating…" : kpi.is_active ? "Deactivate" : "Reactivate"}
                            </button>
                          </div>

                          {kpiOpen ? (
                            <div className="mt-2 space-y-1 pl-3">
                              {kpiSops.map((sop) => (
                                <div key={sop.id} className="rounded border border-slate-200 p-2">
                                  <p className="text-xs font-medium">{sop.title} {!sop.is_active ? "(Inactive)" : ""}</p>
                                  <div className="flex gap-2">
                                    <button type="button" onClick={() => setSelected({ type: "sop", id: sop.id })} className="text-xs text-[#1B4F8A]">Edit Solution</button>
                                    <button
                                      type="button"
                                      onClick={() => toggleActive("sop", sop.id, sop.is_active)}
                                      disabled={isPending(`fw-toggle-sop-${sop.id}`)}
                                      className="text-xs text-rose-700 disabled:opacity-50"
                                    >
                                      {isPending(`fw-toggle-sop-${sop.id}`) ? "Updating…" : sop.is_active ? "Deactivate" : "Reactivate"}
                                    </button>
                                  </div>
                                </div>
                              ))}

                              <div className="space-y-1 rounded border border-dashed border-slate-300 p-2">
                                <p className="text-xs font-medium">+ Add Solution</p>
                                <input value={newSopTitle} onChange={(e) => setNewSopTitle(e.target.value)} placeholder="Solution title" className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
                                <input value={newSopDescription} onChange={(e) => setNewSopDescription(e.target.value)} placeholder="Solution description" className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
                                <button
                                  type="button"
                                  onClick={() => addSop(kpi.id)}
                                  disabled={isPending(`add-sop-${kpi.id}`)}
                                  className="w-full rounded bg-[#1B4F8A] px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                                >
                                  {isPending(`add-sop-${kpi.id}`) ? "Creating…" : "Create Solution"}
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}

                    <div className="space-y-1 rounded border border-dashed border-slate-300 p-2">
                      <p className="text-xs font-medium">+ Add Indicator</p>
                      <input value={newKpiTitle} onChange={(e) => setNewKpiTitle(e.target.value)} placeholder="Indicator title" className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
                      <input value={newKpiUnit} onChange={(e) => setNewKpiUnit(e.target.value)} placeholder="Measurement unit" className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
                      <button
                        type="button"
                        onClick={() => addKpi(kra.id)}
                        disabled={isPending(`add-kpi-${kra.id}`)}
                        className="w-full rounded bg-[#1B4F8A] px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {isPending(`add-kpi-${kra.id}`) ? "Creating…" : "Create Indicator"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <h2 className="text-sm font-semibold">{selectedLabel}</h2>
          {selected ? (
            <div className="mt-2 space-y-2">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              {selected.type === "kpi" ? (
                <input value={measurementUnit} onChange={(e) => setMeasurementUnit(e.target.value)} placeholder="Measurement unit" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              ) : (
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              )}
              <button
                type="button"
                onClick={saveSelected}
                disabled={isPending("fw-save")}
                className="w-full rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isPending("fw-save") ? "Saving…" : "Save"}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Pick a Problem, Indicator, or Solution from the tree.</p>
          )}
        </div>
      </section>
    </CanDo>
  );
}
