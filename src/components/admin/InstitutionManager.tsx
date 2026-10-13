import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CalendarDays, MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const db = supabase as any;

type InstitutionRow = {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  created_at: string;
};

export function InstitutionManager() {
  const { role, user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = role === "admin";
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [city, setCity] = useState("");

  const institutions = useQuery({
    enabled: isAdmin,
    queryKey: ["admin-institutions"],
    queryFn: async (): Promise<InstitutionRow[]> => {
      const { data, error } = await db
        .from("institutions")
        .select("id, name, code, city, created_at")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as InstitutionRow[];
    },
  });

  const createInstitution = useMutation({
    mutationFn: async () => {
      const cleanName = name.trim();
      if (!cleanName) throw new Error("Enter an institution name.");
      const { error } = await db.from("institutions").insert({
        name: cleanName,
        code: code.trim() || null,
        city: city.trim() || null,
        created_by: user?.id ?? null,
      });
      if (error) {
        if (error.code === "23505") {
          throw new Error("An institution with that name already exists.");
        }
        throw error;
      }
    },
    onSuccess: async () => {
      setName("");
      setCode("");
      setCity("");
      toast.success("Institution created.");
      await queryClient.invalidateQueries({ queryKey: ["admin-institutions"] });
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't create the institution."),
  });

  if (!isAdmin) {
    return (
      <section className="panel p-6">
        <h2 className="font-semibold">Platform admins only</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Only a platform administrator can create institutions.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-xl font-semibold">Institution directory</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Register colleges, schools and universities before onboarding their staff and students.
        </p>
      </header>

      <section className="panel space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Building2 className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Create an institution</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add the institution to ONYX's directory. Creating it does not create user accounts
              or grant anyone administrator access.
            </p>
          </div>
        </div>

        <form
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            createInstitution.mutate();
          }}
        >
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <label htmlFor="institution-name" className="text-sm font-medium">
              Institution name <span className="text-destructive">*</span>
            </label>
            <Input
              id="institution-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Example University"
              required
              maxLength={160}
              autoComplete="organization"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="institution-code" className="text-sm font-medium">Institution code (optional)</label>
            <Input
              id="institution-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="e.g. EXU"
              maxLength={40}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="institution-city" className="text-sm font-medium">City (optional)</label>
            <Input
              id="institution-city"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="e.g. Pune"
              maxLength={100}
            />
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={!name.trim() || createInstitution.isPending}>
              <Plus className="mr-2 size-4" />
              {createInstitution.isPending ? "Creating institution…" : "Create institution"}
            </Button>
          </div>
        </form>
      </section>

      <section className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Registered institutions</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {institutions.data?.length ?? 0} institution{institutions.data?.length === 1 ? "" : "s"} in the directory.
            </p>
          </div>
        </div>

        {institutions.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : institutions.isError ? (
          <div className="rounded-lg border border-destructive/30 p-4">
            <p className="text-sm text-destructive">
              Couldn't load institutions. Check that the institution-directory database migration has been applied, then retry.
            </p>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => void institutions.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : !institutions.data?.length ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Building2 className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">No institutions yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Create the first institution above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Institution</th>
                  <th className="p-3 font-medium">Code</th>
                  <th className="p-3 font-medium">City</th>
                  <th className="p-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {institutions.data.map((institution) => (
                  <tr key={institution.id} className="hover:bg-muted/30">
                    <td className="p-3 font-medium">{institution.name}</td>
                    <td className="p-3 text-muted-foreground">{institution.code || "—"}</td>
                    <td className="p-3 text-muted-foreground">
                      {institution.city ? (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="size-3.5" /> {institution.city}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" />
                        {new Date(institution.created_at).toLocaleDateString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
