export const STATUSES = ["present", "absent", "late", "excused"] as const;
export type AttendanceStatus = (typeof STATUSES)[number];

/** Attendance below this percentage is flagged. Matches the 75% used on the reports page. */
export const LOW_ATTENDANCE_THRESHOLD = 75;

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "Excused",
};

export const STATUS_LETTER: Record<AttendanceStatus, string> = {
  present: "P",
  absent: "A",
  late: "L",
  excused: "E",
};

export const STATUS_TONE: Record<AttendanceStatus, string> = {
  present: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  absent: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  late: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  excused: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today's date in the person's own time zone (not UTC), as YYYY-MM-DD. */
export function localDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function currentMonth(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Move a YYYY-MM-DD date by whole days without any time-zone drift. */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days);
  return localDateString(next);
}

/** First and last day (YYYY-MM-DD) of a YYYY-MM month. */
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const year = y ?? 1970;
  const mon = m ?? 1;
  const last = new Date(year, mon, 0).getDate();
  return { start: `${year}-${pad(mon)}-01`, end: `${year}-${pad(mon)}-${pad(last)}` };
}

export function formatDay(date: string, opts?: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).toLocaleDateString(
    undefined,
    opts ?? { weekday: "short", day: "numeric", month: "short", year: "numeric" },
  );
}

export type Tally = Record<AttendanceStatus, number> & { total: number };

export function emptyTally(): Tally {
  return { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
}

export function tallyStatuses(statuses: Iterable<AttendanceStatus>): Tally {
  const t = emptyTally();
  for (const s of statuses) {
    t[s] += 1;
    t.total += 1;
  }
  return t;
}

/**
 * Attendance percentage. Only absences count against a student, which matches how the
 * reports page and the database report function calculate it (present + excused + late).
 */
export function attendancePercent(t: Tally): number | null {
  if (t.total === 0) return null;
  return Math.round(((t.total - t.absent) / t.total) * 1000) / 10;
}

export function isLow(percent: number | null): boolean {
  return percent !== null && percent < LOW_ATTENDANCE_THRESHOLD;
}

type Person = { full_name?: string | null; roll_no?: string | null };

/** Roll number first (natural order, so 2 comes before 10), then name. */
export function compareRoster(a: Person, b: Person): number {
  const ar = (a.roll_no ?? "").trim();
  const br = (b.roll_no ?? "").trim();
  if (ar && br) {
    const byRoll = ar.localeCompare(br, undefined, { numeric: true });
    if (byRoll !== 0) return byRoll;
  } else if (ar || br) {
    return ar ? -1 : 1;
  }
  return (a.full_name ?? "").localeCompare(b.full_name ?? "", undefined, { sensitivity: "base" });
}
