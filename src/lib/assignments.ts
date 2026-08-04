export type SubmissionStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "late"
  | "reviewed"
  | "returned"
  | "completed";

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  late: "Late",
  reviewed: "Reviewed",
  returned: "Returned",
  completed: "Completed",
};

// green = complete, yellow = pending, red = late, blue = under review
export const STATUS_TONE: Record<SubmissionStatus, string> = {
  not_started: "bg-muted text-muted-foreground border-border",
  in_progress: "bg-warning/15 text-warning-foreground border-warning/40 dark:text-warning",
  submitted: "bg-info/15 text-info border-info/40",
  late: "bg-destructive/15 text-destructive border-destructive/40",
  reviewed: "bg-info/15 text-info border-info/40",
  returned: "bg-warning/15 text-warning-foreground border-warning/40 dark:text-warning",
  completed: "bg-success/15 text-success border-success/40",
};

export function daysLate(due: string | null, at?: string | null) {
  if (!due) return 0;
  const end = at ? new Date(at) : new Date();
  const diff = end.getTime() - new Date(due).getTime();
  return diff <= 0 ? 0 : Math.ceil(diff / 86_400_000);
}

export function formatDue(due: string | null) {
  if (!due) return "No due date";
  return new Date(due).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function makeJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
