import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { PlatformInstitutionHub } from "@/components/admin/PlatformInstitutionHub";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/institution")({
  head: () => ({
    meta: [
      { title: "Institution — ONYX" },
      {
        name: "description",
        content: "Institution-scoped classes, assignments, departments and enrolment.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InstitutionOverviewPage,
});

function InstitutionOverviewPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const canViewInstitution = role === "admin" || role === "institution_admin";

  useEffect(() => {
    if (!loading && !canViewInstitution) {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, canViewInstitution, navigate]);

  if (loading || !canViewInstitution) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  return <PlatformInstitutionHub />;
}
