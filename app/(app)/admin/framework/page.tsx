"use client";

import { useEffect, useMemo, useState } from "react";
import { CanDo } from "@/components/CanDo";
import { PERMISSIONS } from "@/lib/auth/permissions";

type KRA = { id: string; title: string; description: string | null };
type KPI = { id: string; title: string; measurement_unit: string | null; kra_id: string };
type SOP = { id: string; title: string; description: string | null; kpi_id: string };

type NodeSelection =
  | { type: "kra"; id: string }
  | { type: "kpi"; id: string }
  | { type: "sop"; id: string }
  | null;

export default function FrameworkPage() {
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

  const addKra = async () => {
    await fetch("/api/admin/framework", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "kra", title: newKraTitle, description: newKraDescription }),
    });
    setNewKraTitle("");
    setNewKraDescription("");
    await loadData();
  };

  const addKpi = async (kraId: string) => {
    await fetch("/api/admin/framework", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "kpi", kraId, title: newKpiTitle, measurementUnit: newKpiUnit }),
    });
    setNewKpiTitle("");
    setNewKpiUnit("");
    await loadData();
  };

  const addSop = async (kpiId: string) => {
    await fetch("/api/admin/framework", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "sop", kpiId, title: newSopTitle, description: newSopDescription }),
    });
    setNewSopTitle("");
    setNewSopDescription("");
    await loadData();
  };

  const saveSelected = async () => {
    if (!selected) return;
    await fetch("/api/admin/framework", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        selected.type === "kpi"
          ? { type: selected.type, id: selected.id, title, measurementUnit }
          : { type: selected.type, id: selected.id, title, description }
      ),
    });
    await loadData();
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
            <button type="button" onClick={() => void addKra()} className="w-full rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white">Create Problem</button>
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
                  {kraOpen ? "▼" : "▶"} {kra.title}
                </button>
                <button type="button" onClick={() => setSelected({ type: "kra", id: kra.id })} className="mt-1 text-xs text-[#1B4F8A]">Edit Problem</button>

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
                            {kpiOpen ? "▼" : "▶"} {kpi.title}
                          </button>
                          <button type="button" onClick={() => setSelected({ type: "kpi", id: kpi.id })} className="mt-1 text-xs text-[#1B4F8A]">Edit Indicator</button>

                          {kpiOpen ? (
                            <div className="mt-2 space-y-1 pl-3">
                              {kpiSops.map((sop) => (
                                <div key={sop.id} className="rounded border border-slate-200 p-2">
                                  <p className="text-xs font-medium">{sop.title}</p>
                                  <button type="button" onClick={() => setSelected({ type: "sop", id: sop.id })} className="text-xs text-[#1B4F8A]">Edit Solution</button>
                                </div>
                              ))}

                              <div className="space-y-1 rounded border border-dashed border-slate-300 p-2">
                                <p className="text-xs font-medium">+ Add Solution</p>
                                <input value={newSopTitle} onChange={(e) => setNewSopTitle(e.target.value)} placeholder="Solution title" className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
                                <input value={newSopDescription} onChange={(e) => setNewSopDescription(e.target.value)} placeholder="Solution description" className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
                                <button type="button" onClick={() => void addSop(kpi.id)} className="w-full rounded bg-[#1B4F8A] px-2 py-1 text-xs font-semibold text-white">Create Solution</button>
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
                      <button type="button" onClick={() => void addKpi(kra.id)} className="w-full rounded bg-[#1B4F8A] px-2 py-1 text-xs font-semibold text-white">Create Indicator</button>
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
              <button type="button" onClick={() => void saveSelected()} className="w-full rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white">Save</button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Pick a Problem, Indicator, or Solution from the tree.</p>
          )}
        </div>
      </section>
    </CanDo>
  );
}
