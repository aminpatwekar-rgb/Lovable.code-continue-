import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Building2, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { takeInstitutionWelcome, type InstitutionWelcome } from "@/lib/my-institution";

/** One-time welcome shown on the dashboard right after someone joins through a join link. */
export function InstitutionWelcomeDialog() {
  const [welcome, setWelcome] = useState<InstitutionWelcome | null>(null);

  useEffect(() => {
    setWelcome(takeInstitutionWelcome());
  }, []);

  if (!welcome) return null;
  const pending = welcome.status === "pending";

  return (
    <Dialog open onOpenChange={(open) => !open && setWelcome(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center sm:text-center">
          <span
            className={
              pending
                ? "flex size-12 items-center justify-center rounded-full bg-warning/15 text-warning"
                : "flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
            }
          >
            {pending ? <Clock className="size-6" /> : <CheckCircle2 className="size-6" />}
          </span>
          <DialogTitle className="pt-2">
            {pending ? `Request sent to ${welcome.institutionName}` : `Welcome to ${welcome.institutionName}`}
          </DialogTitle>
          <DialogDescription>
            {pending
              ? `${welcome.institutionName} needs to approve your request to join as a ${welcome.role}. You will get a notification as soon as that happens.`
              : welcome.departmentName
                ? `You joined as a ${welcome.role} in the ${welcome.departmentName} department. Your classes, classmates and teachers are on the My Institution page.`
                : `You joined as a ${welcome.role}. Your institution will place you in a department soon, and you will be notified when they do.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-center">
          {!pending && (
            <Button asChild className="gap-2" onClick={() => setWelcome(null)}>
              <Link to="/my-institution">
                <Building2 className="size-4" /> View my institution
              </Link>
            </Button>
          )}
          <Button variant={pending ? "default" : "outline"} onClick={() => setWelcome(null)}>
            {pending ? "Got it" : "Continue to dashboard"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
