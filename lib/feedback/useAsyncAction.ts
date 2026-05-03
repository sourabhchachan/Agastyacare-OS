"use client";

import { useCallback, useRef, useState } from "react";
import { useToast } from "@/components/feedback/ToastProvider";
import { humanizeError } from "@/lib/feedback/humanizeError";

export type AsyncRunOptions<T> = {
  /** Shown via toast on success (omit or null to skip success toast). */
  successMessage?: string | null;
  onSuccess?: (result: T) => void;
};

/**
 * Per-action-key async runner: disables matching buttons, shows errors via toast,
 * optional success toast, then runs onSuccess.
 */
export function useAsyncAction() {
  const { showToast } = useToast();
  const [pendingMap, setPendingMap] = useState<Record<string, boolean>>({});
  const pendingRef = useRef<Set<string>>(new Set());

  const isPending = useCallback(
    (key: string) => Boolean(pendingMap[key]),
    [pendingMap]
  );

  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, options?: AsyncRunOptions<T>): Promise<T | undefined> => {
      if (pendingRef.current.has(key)) return undefined;
      pendingRef.current.add(key);
      setPendingMap((m) => ({ ...m, [key]: true }));
      try {
        const result = await fn();
        const msg = options?.successMessage;
        if (msg) showToast("success", msg);
        options?.onSuccess?.(result);
        return result;
      } catch (e) {
        showToast("error", humanizeError(e));
        return undefined;
      } finally {
        pendingRef.current.delete(key);
        setPendingMap((m) => ({ ...m, [key]: false }));
      }
    },
    [showToast]
  );

  return { run, isPending };
}
