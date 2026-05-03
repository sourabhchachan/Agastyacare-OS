"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/feedback/ToastProvider";
import { humanizeResponseError } from "@/lib/feedback/humanizeError";
import { useAsyncAction } from "@/lib/feedback/useAsyncAction";
import { UserFacingError } from "@/lib/feedback/userFacingError";

const keypad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "del"];

export default function LoginPage() {
  const [staffId, setStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { showToast } = useToast();
  const { run, isPending } = useAsyncAction();

  const updatePin = (key: string) => {
    if (key === "clear") return setPin("");
    if (key === "del") return setPin((prev) => prev.slice(0, -1));
    if (pin.length >= 6) return;
    setPin((prev) => prev + key);
  };

  const handleLogin = () => {
    if (!/^\d{10}$/.test(staffId)) {
      setError("Enter a valid 10-digit ID.");
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      setError("Enter a valid 6-digit PIN.");
      return;
    }

    setError(null);

    void run(
      "login",
      async () => {
        const loginResponse = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ staffId, pin }),
        });

        const loginResult = (await loginResponse.json().catch(() => ({}))) as {
          error?: string;
          mustChangePin?: boolean;
        };

        if (!loginResponse.ok) {
          throw new UserFacingError(await humanizeResponseError(loginResponse));
        }

        if (loginResult.mustChangePin) {
          showToast("success", "Please set a new PIN to continue.");
          router.push("/change-pin");
          return;
        }

        showToast("success", "Signed in");
        router.push("/");
      },
      { successMessage: null }
    );
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center bg-white px-6">
      <h1 className="text-center text-2xl font-semibold text-[#1B4F8A]">OS</h1>
      <p className="mt-2 text-center text-sm text-slate-600">Sign in with your Staff ID and PIN</p>

      <div className="mt-6 space-y-4">
        <input
          type="tel"
          value={staffId}
          onChange={(e) => setStaffId(e.target.value.replace(/\D/g, "").slice(0, 10))}
          placeholder="10-digit ID"
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-[#1B4F8A]"
        />

        <div className="rounded-xl border border-slate-300 px-4 py-3 text-center text-2xl tracking-[0.5rem]">
          {"*".repeat(pin.length).padEnd(6, "-")}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {keypad.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => updatePin(key)}
              disabled={isPending("login")}
              className="rounded-xl border border-slate-300 px-3 py-4 text-base font-medium capitalize active:scale-[0.99] disabled:opacity-50"
            >
              {key}
            </button>
          ))}
        </div>

        {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}

        <button
          type="button"
          onClick={handleLogin}
          disabled={isPending("login")}
          className="w-full rounded-xl bg-[#1B4F8A] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isPending("login") ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </main>
  );
}
