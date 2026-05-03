"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/feedback/ToastProvider";
import { humanizeResponseError } from "@/lib/feedback/humanizeError";
import { useAsyncAction } from "@/lib/feedback/useAsyncAction";
import { UserFacingError } from "@/lib/feedback/userFacingError";

const keypad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "del"];

export default function ChangePinPage() {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [activeField, setActiveField] = useState<"pin" | "confirm">("pin");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { showToast } = useToast();
  const { run, isPending } = useAsyncAction();

  const updatePinField = (key: string) => {
    const setter = activeField === "pin" ? setPin : setConfirmPin;
    const value = activeField === "pin" ? pin : confirmPin;
    if (key === "clear") return setter("");
    if (key === "del") return setter((prev) => prev.slice(0, -1));
    if (value.length >= 6) return;
    setter((prev) => prev + key);
  };

  const handleChangePin = () => {
    if (!/^\d{6}$/.test(pin)) {
      setError("PIN must be 6 digits.");
      return;
    }
    if (!/^\d{6}$/.test(confirmPin)) {
      setError("Confirm PIN must be 6 digits.");
      return;
    }

    if (pin !== confirmPin) {
      setError("PINs do not match.");
      return;
    }

    setError(null);

    void run(
      "change-pin",
      async () => {
        const response = await fetch("/api/auth/change-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin, confirmPin }),
        });

        if (!response.ok) {
          throw new UserFacingError(await humanizeResponseError(response));
        }

        showToast("success", "PIN updated");
        window.setTimeout(() => {
          router.push("/");
        }, 600);
      },
      { successMessage: null }
    );
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center bg-white px-6">
      <h1 className="text-center text-2xl font-semibold text-[#1B4F8A]">Change PIN</h1>
      <p className="mt-2 text-center text-sm text-slate-600">Set a new 6-digit PIN for your first login.</p>

      <div className="mt-6 space-y-3">
        <button
          type="button"
          onClick={() => setActiveField("pin")}
          disabled={isPending("change-pin")}
          className={`w-full rounded-xl border px-4 py-3 text-left outline-none ${
            activeField === "pin" ? "border-[#1B4F8A]" : "border-slate-300"
          }`}
        >
          <p className="text-xs text-slate-500">New PIN</p>
          <p className="text-xl tracking-[0.5rem]">{"*".repeat(pin.length).padEnd(6, "-")}</p>
        </button>
        <button
          type="button"
          onClick={() => setActiveField("confirm")}
          disabled={isPending("change-pin")}
          className={`w-full rounded-xl border px-4 py-3 text-left outline-none ${
            activeField === "confirm" ? "border-[#1B4F8A]" : "border-slate-300"
          }`}
        >
          <p className="text-xs text-slate-500">Confirm PIN</p>
          <p className="text-xl tracking-[0.5rem]">{"*".repeat(confirmPin.length).padEnd(6, "-")}</p>
        </button>
        <div className="grid grid-cols-3 gap-2">
          {keypad.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => updatePinField(key)}
              disabled={isPending("change-pin")}
              className="min-h-11 rounded-xl border border-slate-300 px-3 py-3 text-base font-medium capitalize disabled:opacity-50"
            >
              {key}
            </button>
          ))}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="button"
          onClick={handleChangePin}
          disabled={isPending("change-pin")}
          className="w-full rounded-xl bg-[#1B4F8A] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isPending("change-pin") ? "Updating PIN…" : "Update PIN"}
        </button>
      </div>
    </main>
  );
}
