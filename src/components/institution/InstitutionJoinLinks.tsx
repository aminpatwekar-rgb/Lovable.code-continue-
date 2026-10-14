import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, GraduationCap, Link2, Loader2, Presentation, RefreshCw, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  decideJoinRequest, fetchJoinLinks, fetchJoinRequests, joinUrl, regenerateJoinLink, updateJoinLink,
  type JoinLink, type JoinRole,
} from "@/lib/institution-join";

const ROLE_COPY: Record<JoinRole, { title: string; blurb: string; icon: typeof GraduationCap }> = {
  student: { title: "Student link", blurb: "Anyone who opens this joins as a student.", icon: GraduationCap },
  teacher: { title: "Teacher link", blurb: "Anyone who opens this joins as a teacher.", icon: Presentation },
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function LinkCard({ institutionId, link }: { institutionId: string; link: JoinLink }) {
  const qc = useQueryClient();
  const copy = ROLE_COPY[link.role];
  const Icon = copy.icon;
  const url = joinUrl(link.code);
  const [copied, setCopied] = useState(false);
  const [expiry, setExpiry] = useState(toLocalInput(link.expiresAt));
  const [maxUses, setMaxUses] = useState(link.maxUses ? String(link.maxUses) : "");

  const refetch = () => qc.invalidateQueries({ queryKey: ["institution-join-links", institutionId] });

  const save = useMutation({
    mutationFn: (patch: Partial<{ isActive: boolean; requiresApproval: boolean }> & { limits?: boolean }) => {
      const parsedUses = maxUses.trim() ? Math.floor(Number(maxUses)) : null;
      if (parsedUses !== null && (!Number.isFinite(parsedUses) || parsedUses < 1)) {
        throw new Error("Maximum uses must be a whole number of at least 1.");
      }
      return updateJoinLink(institutionId, link.role, {
        isActive: patch.isActive ?? link.isActive,
        requiresApproval: patch.requiresApproval ?? link.requiresApproval,
        // End of the chosen day, so "expires on 30 Nov" still works all day.
        expiresAt: expiry ? new Date(`${expiry}T23:59:59`).toISOString() : null,
        maxUses: parsedUses,
      });
    },
    onSuccess: async () => { toast.success("Saved"); await refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const regenerate = useMutation({
    mutationFn: () => regenerateJoinLink(institutionId, link.role),
    onSuccess: async () => { toast.success("New link created. The old one no longer works."); await refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it manually.");
    }
  }

  return (
    <div className="panel space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Icon className="mt-0.5 size-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">{copy.title}</h3>
            <p className="text-xs text-muted-foreground">{copy.blurb}</p>
          </div>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={link.isActive}
            disabled={save.isPending}
            onChange={(e) => save.mutate({ isActive: e.target.checked })}
          />
          Active
        </label>
      </div>

      <div className="flex gap-2">
        <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={link.isActive ? "" : "opacity-60"} />
        <Button type="button" variant="outline" onClick={() => void copyLink()} aria-label={`Copy ${link.role} link`}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (window.confirm("Create a new link? The current one will stop working immediately.")) regenerate.mutate();
          }}
          disabled={regenerate.isPending}
          aria-label={`Create a new ${link.role} link`}
        >
          {regenerate.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={link.requiresApproval}
            disabled={save.isPending}
            onChange={(e) => save.mutate({ requiresApproval: e.target.checked })}
          />
          Approve each {link.role} before they join
        </label>
        <label className="flex items-center gap-2">
          Expires
          <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="h-8 w-36" />
        </label>
        <label className="flex items-center gap-2">
          Max uses
          <Input
            inputMode="numeric"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))}
            placeholder="No limit"
            className="h-8 w-24"
          />
        </label>
        <Button type="button" size="sm" variant="secondary" onClick={() => save.mutate({})} disabled={save.isPending}>
          Save limits
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Used {link.useCount} time{link.useCount === 1 ? "" : "s"}.
        {!link.isActive && " This link is switched off."}
      </p>
    </div>
  );
}

function PendingRequests({ institutionId }: { institutionId: string }) {
  const qc = useQueryClient();
  const [departmentFor, setDepartmentFor] = useState<Record<string, string>>({});
  const departments = useQuery({
    queryKey: ["institution-departments-simple", institutionId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("departments")
        .select("id, name")
        .eq("institution_id", institutionId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    retry: false,
  });
  const requests = useQuery({
    queryKey: ["institution-join-requests", institutionId],
    queryFn: () => fetchJoinRequests(institutionId),
  });
  const decide = useMutation({
    mutationFn: (v: { id: string; approve: boolean; departmentId?: string | null }) =>
      decideJoinRequest(v.id, v.approve, v.departmentId ?? null),
    onSuccess: async (_d, v) => {
      toast.success(v.approve ? "Approved" : "Declined");
      await qc.invalidateQueries({ queryKey: ["institution-join-requests", institutionId] });
      await qc.invalidateQueries({ queryKey: ["institution-admin-overview"] });
      await qc.invalidateQueries({ queryKey: ["admin-institution-people"] });
      await qc.invalidateQueries({ queryKey: ["institution-people"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (requests.isLoading) return <Skeleton className="h-16 w-full rounded-xl" />;
  if (requests.isError || !requests.data?.length) return null;

  return (
    <div className="panel space-y-3 p-4">
      <div className="flex items-center gap-2">
        <UserCheck className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Waiting for approval ({requests.data.length})</h3>
      </div>
      <ul className="divide-y divide-border">
        {requests.data.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.fullName || "Unnamed"}</p>
              <p className="truncate text-xs text-muted-foreground">{r.email ?? "No email"} · wants to join as {r.role}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!!departments.data?.length && (
                <select
                  aria-label={`Department for ${r.fullName || "this person"}`}
                  value={departmentFor[r.id] ?? ""}
                  onChange={(e) => setDepartmentFor((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">No department yet</option>
                  {departments.data.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
              <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, approve: true, departmentId: departmentFor[r.id] || null })}>
                <Check className="mr-1 size-4" />Approve
              </Button>
              <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, approve: false })}>
                <X className="mr-1 size-4" />Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Student link + teacher link for one institution, plus anyone waiting for approval. */
export function InstitutionJoinLinks({ institutionId }: { institutionId: string }) {
  const links = useQuery({
    queryKey: ["institution-join-links", institutionId],
    queryFn: () => fetchJoinLinks(institutionId),
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="size-4 text-primary" />
        <h2 className="text-base font-semibold">Join links</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Share these instead of creating accounts one by one. People open the link, sign up or sign in, and land in your institution with the right role.
      </p>
      {links.isLoading && <Skeleton className="h-40 w-full rounded-xl" />}
      {links.isError && <p className="text-sm text-destructive">Couldn't load the join links. Make sure the latest database migration has been applied.</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {links.data?.map((link) => <LinkCard key={`${link.role}-${link.code}`} institutionId={institutionId} link={link} />)}
      </div>
      <PendingRequests institutionId={institutionId} />
    </section>
  );
}
