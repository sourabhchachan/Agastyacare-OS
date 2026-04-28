const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;
const MAX_RECURRING = 50;

const HR_MAP: Record<string, number> = {
  "1hr": 1,
  "2hr": 2,
  "4hr": 4,
  "6hr": 6,
  "8hr": 8,
  "12hr": 12,
};

function parseTimeHHmm(hhmm: string | null | undefined): { h: number; m: number } {
  if (!hhmm) return { h: 8, m: 0 };
  const s = hhmm.replace(/\D/g, "").padStart(4, "0");
  return { h: parseInt(s.slice(0, 2), 10), m: parseInt(s.slice(2, 4), 10) };
}

/** First due moment for a recurring item from a base time. */
export function getFirstDueRecurring(
  from: Date,
  frequency: string,
  frequencyTime: string | null,
  frequencyDay: string | null
): Date {
  void frequencyDay;
  if (frequency === "once") {
    const t = new Date(from.getTime() + MS_HOUR);
    return t;
  }
  if (HR_MAP[frequency]) {
    const hours = HR_MAP[frequency]!;
    const t = new Date(from);
    t.setSeconds(0, 0);
    const start = t.getTime();
    const block = hours * MS_HOUR;
    const next = Math.ceil(start / block) * block;
    return new Date(next);
  }
  if (frequency === "daily" || ["OD", "BD", "TDS", "QID"].includes(frequency)) {
    const { h, m } = parseTimeHHmm(frequencyTime);
    const t = new Date(from);
    t.setHours(h, m, 0, 0);
    if (t.getTime() <= from.getTime()) {
      t.setTime(t.getTime() + MS_DAY);
    }
    return t;
  }
  if (frequency === "weekly") {
    const t = new Date(from);
    t.setHours(8, 0, 0, 0);
    t.setTime(t.getTime() + MS_DAY * 7);
    return t;
  }
  const t = new Date(from.getTime() + MS_HOUR);
  return t;
}

function addByFrequency(d: Date, frequency: string, _frequencyTime: string | null): Date {
  void _frequencyTime;
  if (frequency === "once") {
    return new Date(d.getTime() + MS_DAY);
  }
  if (HR_MAP[frequency]) {
    return new Date(d.getTime() + HR_MAP[frequency]! * MS_HOUR);
  }
  if (frequency === "daily" || ["OD", "BD", "TDS", "QID"].includes(frequency)) {
    return new Date(d.getTime() + MS_DAY);
  }
  if (frequency === "weekly") {
    return new Date(d.getTime() + 7 * MS_DAY);
  }
  return new Date(d.getTime() + MS_HOUR);
}

export function buildRecurringDueList(
  first: Date,
  frequency: string,
  frequencyTime: string | null,
  endBefore: Date
): Date[] {
  if (frequency === "once") {
    return [new Date(first)];
  }
  const out: Date[] = [];
  let cur = new Date(first);
  let n = 0;
  while (n < MAX_RECURRING && cur < endBefore) {
    out.push(new Date(cur));
    cur = addByFrequency(cur, frequency, frequencyTime);
    n += 1;
  }
  return out;
}

const triggeredOffsets: Record<string, number[]> = {
  OD: [0],
  BD: [0, 6],
  TDS: [0, 4, 8],
  QID: [0, 3, 6, 9],
};

export function getTriggeredInstanceCount(frequency: string): number {
  if (["BD", "TDS", "QID", "OD"].includes(frequency)) {
    return triggeredOffsets[frequency]?.length ?? 1;
  }
  return 1;
}

export function getTriggeredDueAt(
  from: Date,
  frequency: string,
  index: number
): Date {
  if (["BD", "TDS", "QID", "OD"].includes(frequency)) {
    const off = triggeredOffsets[frequency] ?? [0];
    return new Date(from.getTime() + (off[index] ?? index * 4) * MS_HOUR);
  }
  return from;
}
