import { UserFacingError } from "./userFacingError";

function isProbablyTechnical(message: string): boolean {
  const m = message.toLowerCase();
  return (
    message.length > 180 ||
    /\bpostgres\b|\bpg_\b|syntax error|violates check|stack trace|typeerror|referenceerror|chunkloaderror/.test(m) ||
    /\n/.test(message)
  );
}

/** Turn thrown values and raw API strings into short, human-readable copy. */
export function humanizeError(e: unknown): string {
  if (e instanceof UserFacingError) {
    return isProbablyTechnical(e.message) ? "Something went wrong. Please try again." : e.message;
  }

  if (typeof e === "string") {
    const s = e.trim();
    if (!s) return "Something went wrong. Please try again.";
    if (isProbablyTechnical(s)) return "Something went wrong. Please try again.";
    return s;
  }

  if (e instanceof Error) {
    const s = e.message.trim();
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(s)) {
      return "Could not reach the server. Check your connection and try again.";
    }
    if (/abort|timeout/i.test(s)) return "The request took too long. Please try again.";
    if (/jwt|session|unauthori[sz]ed|not authenticated/i.test(s)) {
      return "Your session may have expired. Please sign in again.";
    }
    if (/permission denied|rls|row-level security|forbidden/i.test(s)) {
      return "You do not have permission to do that.";
    }
    if (/violates foreign key|foreign key constraint/i.test(s)) {
      return "That record is no longer valid. Refresh the page and try again.";
    }
    if (/unique constraint|duplicate key/i.test(s)) {
      return "That already exists. Choose a different value.";
    }
    if (!s || isProbablyTechnical(s)) return "Something went wrong. Please try again.";
    return s;
  }

  return "Something went wrong. Please try again.";
}

/** Read `{ error?: string }` from a failed JSON response and humanize. */
export async function humanizeResponseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error && typeof body.error === "string") {
      return humanizeError(new UserFacingError(body.error));
    }
  } catch {
    // ignore
  }
  if (res.status === 401) return "Please sign in again.";
  if (res.status === 403) return "You do not have permission to do that.";
  if (res.status === 404) return "That record was not found. It may have been removed.";
  if (res.status >= 500) return "The server had a problem. Please try again in a moment.";
  return "Something went wrong. Please try again.";
}
