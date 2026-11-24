import { Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown to institution admins on pages built for class teachers or students. */
export function InstitutionAdminNotice({ what }: { what: string }) {
  return (
    <div className="mx-auto max-w-xl space-y-4 py-10 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Building2 className="size-6" /></span>
      <h1 className="text-xl font-semibold text-foreground">{what} are managed by class teachers</h1>
      <p className="text-sm text-muted-foreground">As an institution admin, you can follow progress across every class in your institution.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild><Link to="/reports">Institution reports</Link></Button>
        <Button asChild variant="outline"><Link to="/grading">Grading overview</Link></Button>
        <Button asChild variant="outline"><Link to="/institution">Institution overview</Link></Button>
      </div>
    </div>
  );
}
