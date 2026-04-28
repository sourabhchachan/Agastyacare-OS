function toYmdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function orderDateToDdMmYy(d: string | null | undefined): string {
  if (!d) return "";
  const parts = d.split("-");
  if (parts.length < 3) return "";
  const [y, m, day] = parts;
  if (!y || !m || !day) return "";
  const yy = y.length === 4 ? y.slice(2) : y;
  return `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}/${yy}`;
}

const COST_STATUSES = new Set(["ordered", "dispatched", "received"]);

export function lineContributesToRunningCost(status: string) {
  return COST_STATUSES.has(status);
}

export function todayYmd(): string {
  return toYmdLocal(new Date());
}

export function firstDayOfMonthYmd(d = new Date()): string {
  const t = new Date(d.getFullYear(), d.getMonth(), 1);
  return toYmdLocal(t);
}

export function lastDayOfMonthYmd(d = new Date()): string {
  const t = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return toYmdLocal(t);
}

export function firstDayOfIsoWeekYmd(d = new Date()): string {
  const day = d.getDay();
  const diff = (day + 6) % 7;
  const t = new Date(d);
  t.setDate(t.getDate() - diff);
  t.setHours(0, 0, 0, 0);
  return toYmdLocal(t);
}

export function endOfIsoWeekYmd(d = new Date()): string {
  const start = firstDayOfIsoWeekYmd(d);
  const [y, m, day] = start.split("-").map(Number);
  const t = new Date(y ?? 0, (m ?? 1) - 1, day ?? 1);
  t.setDate(t.getDate() + 6);
  return toYmdLocal(t);
}

export function dateInOrderRange(ymd: string, from: string, to: string) {
  if (!ymd) return false;
  if (ymd < from) return false;
  if (ymd > to) return false;
  return true;
}

export function lineCost(quantity: number, unit: number) {
  return Math.round(quantity * unit * 100) / 100;
}
