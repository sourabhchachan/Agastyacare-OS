"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const KEY = "ac_hos_last_activity";

export function SessionTimeoutGuard() {
  const router = useRouter();

  useEffect(() => {
    const touch = () => localStorage.setItem(KEY, String(Date.now()));
    const check = async () => {
      const last = Number(localStorage.getItem(KEY) || "0");
      if (!last) {
        touch();
        return;
      }
      if (Date.now() - last <= EIGHT_HOURS_MS) return;
      const supabase = createClient();
      await supabase.auth.signOut();
      localStorage.removeItem(KEY);
      router.push("/login");
    };

    const onActivity = () => touch();
    const events: Array<keyof WindowEventMap> = ["click", "keydown", "touchstart", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    const int = window.setInterval(() => {
      void check();
    }, 60 * 1000);
    void check();
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, onActivity));
      window.clearInterval(int);
    };
  }, [router]);

  return null;
}
