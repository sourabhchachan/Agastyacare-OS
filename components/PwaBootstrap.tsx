"use client";

import { useEffect, useState } from "react";
import { useAsyncAction } from "@/lib/feedback/useAsyncAction";
import { UserFacingError } from "@/lib/feedback/userFacingError";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PwaBootstrap() {
  const { run, isPending } = useAsyncAction();
  const [offline, setOffline] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      if (localStorage.getItem("ac_hos_install_prompt_seen")) return;
      setInstallEvent(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => null);
    }

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem("ac_hos_install_prompt_seen", "1");
    setShowPrompt(false);
  };

  const install = () => {
    void run("pwa-install", async () => {
      if (!installEvent) throw new UserFacingError("Install is not available right now.");
      await installEvent.prompt();
      await installEvent.userChoice;
      dismiss();
    }, { successMessage: "Install prompt finished" });
  };

  return (
    <>
      {offline ? (
        <div className="fixed inset-x-0 top-0 z-50 mx-auto w-full max-w-md bg-amber-100 px-3 py-2 text-center text-xs font-medium text-amber-900">
          You are offline - showing last known queue
        </div>
      ) : null}
      {showPrompt ? (
        <div className="fixed inset-x-2 bottom-20 z-50 mx-auto w-auto max-w-md rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <p className="text-sm font-semibold text-slate-900">Install OS</p>
          <p className="mt-1 text-xs text-slate-600">Add this app to your home screen for faster access.</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="min-h-11 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={install}
              disabled={isPending("pwa-install")}
              className="min-h-11 flex-1 rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isPending("pwa-install") ? "Opening…" : "Install"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
