import { useEffect } from "react";
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { isModuleLoadError } from "@/lib/module-load-error";
import { reportLovableError } from "@/lib/lovable-error-reporting";

export function PageLoadError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const moduleFailed = isModuleLoadError(error);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_page_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {moduleFailed ? "A page update couldn't be downloaded. Reload to try again." : "Please try again."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={() => {
            if (moduleFailed) {
              window.location.reload();
              return;
            }
            void router.invalidate();
            reset();
          }}>{moduleFailed ? "Reload page" : "Try again"}</Button>
          <Button asChild variant="outline"><a href="/">Go home</a></Button>
        </div>
      </div>
    </div>
  );
}