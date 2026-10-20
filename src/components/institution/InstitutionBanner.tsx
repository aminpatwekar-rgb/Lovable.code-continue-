import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Clock, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchMyInstitution, MY_INSTITUTION_KEY } from "@/lib/my-institution";

/**
 * Dashboard banner for students and teachers: shows which institution (and department) they
 * belong to, or that a teacher's request is still waiting for approval. Renders nothing for
 * people who are not part of an institution, so there is no "join" prompt here.
 */
export function InstitutionBanner() {
  const { user, role } = useAuth();
  const enabled = Boolean(user) && (role === "student" || role === "teacher");
  const q = useQuery({
    queryKey: [MY_INSTITUTION_KEY, user?.id],
    enabled,
    queryFn: fetchMyInstitution,
    staleTime: 60_000,
  });

  if (!enabled || !q.data) return null;
  const { institution, pending, departments } = q.data;

  const p = pending[0];
  if (!institution && p) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
        <Clock className="mt-0.5 size-5 shrink-0 text-warning" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Waiting for approval from {p.institutionName}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Your request to join as a {p.role} has been sent. You will be notified as soon as it is approved.
          </p>
        </div>
      </div>
    );
  }

  if (!institution) return null;

  const who = role === "teacher" ? "Teacher" : "Student";
  return (
    <Link
      to="/my-institution"
      className="group flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Building2 className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {who} at {institution.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {departments.length > 0
            ? `Department${departments.length > 1 ? "s" : ""}: ${departments.map((d) => d.name).join(", ")}`
            : "You have not been placed in a department yet."}
        </p>
      </div>
      <span className="hidden items-center gap-1 text-xs font-medium text-primary sm:inline-flex">
        View <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
