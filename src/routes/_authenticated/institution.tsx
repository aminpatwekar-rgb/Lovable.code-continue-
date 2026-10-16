import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { PlatformInstitutionHub } from "@/components/admin/PlatformInstitutionHub";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/institution")({
  head: () => ({
    meta: [
      { title: "Institution overview — ONYX" },
      {
        name: "description",
        content: "Platform-wide overview of institutions, departments, classes and enrolment.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InstitutionOverviewPage,
});

function InstitutionOverviewPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && role !== "admin") {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, role, navigate]);

  if (loading || role !== "admin") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  return <PlatformInstitutionHub />;
}
