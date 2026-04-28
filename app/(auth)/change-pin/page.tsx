"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const keypad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "del"];

export default function ChangePinPage() {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [activeField, setActiveField] = useState<"pin" | "confirm">("pin");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const updatePinField = (key: string) => {
    const setter = activeField === "pin" ? setPin : setConfirmPin;
    const value = activeField === "pin" ? pin : confirmPin;
    if (key === "clear") return setter("");
    if (key === "del") return setter((prev) => prev.slice(0, -1));
    if (value.length >= 4) return;
    setter((prev) => prev + key);
  };

  const handleChangePin = async () => {
    if (!/^\d{4}$/.test(pin)) {
      setError("PIN must be 4 digits.");
      return;
    }

    if (pin !== confirmPin) {
      setError("PINs do not match.");
      return;
    }

    setError(null);
    setLoading(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Session expired. Please log in again.");
      setLoading(false);
      return;
    }

    const { error: updateAuthError } = await supabase.auth.updateUser({ password: pin });
    if (updateAuthError) {
      setError(updateAuthError.message);
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase
      .from("staff_users")
      .update({ must_change_pin: false })
      .eq("id", user.id);

    setLoading(false);

    if (profileError) {
      setError(profileError.message);
      return;
    }

    setSuccess("PIN changed successfully.");
    window.setTimeout(() => {
      router.push("/");
    }, 900);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center bg-white px-6">
      <h1 className="text-center text-2xl font-semibold text-[#1B4F8A]">Change PIN</h1>
      <p className="mt-2 text-center text-sm text-slate-600">Set a new 4-digit PIN for your first login.</p>

      <div className="mt-6 space-y-3">
        <button
          type="button"
          onClick={() => setActiveField("pin")}
          className={`w-full rounded-xl border px-4 py-3 text-left outline-none ${
            activeField === "pin" ? "border-[#1B4F8A]" : "border-slate-300"
          }`}
        >
          <p className="text-xs text-slate-500">New PIN</p>
          <p className="text-xl tracking-[0.5rem]">{"*".repeat(pin.length).padEnd(4, "-")}</p>
        </button>
        <button
          type="button"
          onClick={() => setActiveField("confirm")}
          className={`w-full rounded-xl border px-4 py-3 text-left outline-none ${
            activeField === "confirm" ? "border-[#1B4F8A]" : "border-slate-300"
          }`}
        >
          <p className="text-xs text-slate-500">Confirm PIN</p>
          <p className="text-xl tracking-[0.5rem]">{"*".repeat(confirmPin.length).padEnd(4, "-")}</p>
        </button>
        <div className="grid grid-cols-3 gap-2">
          {keypad.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => updatePinField(key)}
              className="min-h-11 rounded-xl border border-slate-300 px-3 py-3 text-base font-medium capitalize"
            >
              {key}
            </button>
          ))}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
        <button
          type="button"
          onClick={() => void handleChangePin()}
          disabled={loading}
          className="w-full rounded-xl bg-[#1B4F8A] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Updating..." : "Update PIN"}
        </button>
      </div>
    </main>
  );
}
