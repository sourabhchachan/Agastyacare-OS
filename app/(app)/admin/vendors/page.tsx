"use client";

import { useEffect, useState } from "react";
import { CanDo } from "@/components/CanDo";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { useToast } from "@/components/feedback/ToastProvider";
import { humanizeError, humanizeResponseError } from "@/lib/feedback/humanizeError";
import { useAsyncAction } from "@/lib/feedback/useAsyncAction";
import { UserFacingError } from "@/lib/feedback/userFacingError";

type Vendor = { id: string; name: string; category: string | null; contact: string | null };

export default function VendorsPage() {
  const { showToast } = useToast();
  const { run, isPending } = useAsyncAction();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [contact, setContact] = useState("");

  const loadVendors = async () => {
    const response = await fetch("/api/admin/vendors");
    if (!response.ok) throw new UserFacingError(await humanizeResponseError(response));
    const result = (await response.json()) as { vendors?: Vendor[] };
    setVendors(result.vendors ?? []);
  };

  useEffect(() => {
    void (async () => {
      try {
        await loadVendors();
      } catch (e) {
        showToast("error", humanizeError(e));
      }
    })();
  }, [showToast]);

  const saveVendor = () => {
    void run(
      "vendor-save",
      async () => {
        const res = await fetch("/api/admin/vendors", {
          method: id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, name, category, contact }),
        });
        if (!res.ok) throw new UserFacingError(await humanizeResponseError(res));

        setId(null);
        setName("");
        setCategory("");
        setContact("");
        await loadVendors();
      },
      { successMessage: id ? "Vendor updated" : "Vendor saved" }
    );
  };

  return (
    <CanDo permission={PERMISSIONS.BUILD_SYSTEM} fallback={<p className="text-sm text-slate-600">No access.</p>}>
      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-[#1B4F8A]">Admin - Vendors</h1>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <h2 className="text-sm font-semibold">{id ? "Edit vendor" : "Add vendor"}</h2>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Contact" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button
            type="button"
            onClick={saveVendor}
            disabled={isPending("vendor-save")}
            className="w-full rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isPending("vendor-save") ? "Saving…" : "Save vendor"}
          </button>
        </div>

        <div className="space-y-2">
          {vendors.map((vendor) => (
            <button
              type="button"
              key={vendor.id}
              onClick={() => {
                setId(vendor.id);
                setName(vendor.name);
                setCategory(vendor.category ?? "");
                setContact(vendor.contact ?? "");
              }}
              className="w-full rounded-xl border border-slate-200 p-3 text-left"
            >
              <p className="text-sm font-semibold">{vendor.name}</p>
              <p className="text-xs text-slate-600">{vendor.category ?? "-"} | {vendor.contact ?? "-"}</p>
            </button>
          ))}
        </div>
      </section>
    </CanDo>
  );
}
