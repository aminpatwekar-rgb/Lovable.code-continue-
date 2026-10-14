import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bulkCreateInstitutionStudents } from "@/lib/admin.functions";
import { toCsv } from "@/lib/csv";

type Person = {
  id: string;
  full_name: string;
  email: string;
  institution: string | null;
  role: "student" | "teacher" | "institution_admin" | "admin" | "unknown";
};

const db = supabase as any;

/** Platform-admin tool: appoint, invite, or remove the administrators of one institution. */
export function InstitutionAdminsCard({
  institutionName,
  institutionId,
  people,
}: {
  institutionName: string;
  institutionId: string;
  people: Person[];
}) {
  const qc = useQueryClient();
  const bulkCreate = useServerFn(bulkCreateInstitutionStudents);
  const [memberId, setMemberId] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [demoteTo, setDemoteTo] = useState<"teacher" | "student">("teacher");

  const inInstitution = people.filter((p) => p.institution?.trim().toLowerCase() === institutionName.trim().toLowerCase());
  const admins = inInstitution.filter((p) => p.role === "institution_admin");
  const candidates = inInstitution.filter((p) => p.role === "teacher" || p.role === "student");

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["admin-institution-people"] });
    await qc.invalidateQueries({ queryKey: ["admin-institutions"] });
    await qc.invalidateQueries({ queryKey: ["institution-people"] });
  };

  const setRole = useMutation({
    mutationFn: async (v: { userId: string; role: "institution_admin" | "teacher" | "student" }) => {
      const { error } = await db.rpc("admin_set_user_role", { _user_id: v.userId, _role: v.role });
      if (error) throw error;
    },
    onSuccess: async (_d, v) => {
      toast.success(v.role === "institution_admin" ? "Institution admin appointed." : "Admin access removed.");
      setMemberId("");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't change the role."),
  });

  const invite = useMutation({
    mutationFn: async () => {
      const email = inviteEmail.trim().toLowerCase();
      const fullName = inviteName.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
      if (!fullName) throw new Error("Enter the administrator's name.");
      const result = await bulkCreate({
        data: {
          institutionId,
          csv: toCsv(["email", "full_name", "role"], [[email, fullName, "institution_admin"]]),
          redirectTo: `${window.location.origin}/reset-password`,
        },
      });
      const row = result.rows[0];
      const ok = Boolean(result.invited || result.assignedExisting || result.alreadyAssigned);
      if (!ok) throw new Error(row?.message ?? "Couldn't add the administrator.");
      return row?.message ?? "Institution admin added.";
    },
    onSuccess: async (message) => {
      toast.success(message);
      setInviteName(""); setInviteEmail("");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selected = candidates.find((p) => p.id === memberId);
  const busy = setRole.isPending || invite.isPending;

  return (
    <section className="panel space-y-4 p-5">
      <div className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 size-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Institution admins</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Only you can appoint administrators. They manage {institutionName}'s people, departments, join links and approvals, and nothing outside it.
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium">Current admins ({admins.length})</h3>
        {admins.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No administrator yet. Appoint one below.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {admins.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 truncate text-sm">{a.full_name || "Unnamed"} <span className="text-xs text-muted-foreground">{a.email}</span></span>
                <Button
                  type="button" size="sm" variant="outline" disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Remove admin access from ${a.full_name || a.email}? They will become a ${demoteTo}.`)) {
                      setRole.mutate({ userId: a.id, role: demoteTo });
                    }
                  }}
                >
                  <ShieldOff className="mr-1.5 size-4" />Remove admin
                </Button>
              </li>
            ))}
          </ul>
        )}
        {admins.length > 0 && (
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            When removing an admin, make them a
            <select value={demoteTo} onChange={(e) => setDemoteTo(e.target.value as "teacher" | "student")} className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground">
              <option value="teacher">teacher</option>
              <option value="student">student</option>
            </select>
          </label>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Appoint someone already in this institution</h3>
          <select
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            aria-label="Choose a member to appoint"
          >
            <option value="">{candidates.length ? "Choose a teacher or student…" : "No teachers or students here yet"}</option>
            {candidates.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email} · {p.role}</option>)}
          </select>
          <Button
            type="button" disabled={!selected || busy}
            onClick={() => {
              if (!selected) return;
              const warn = selected.role === "teacher" ? " They will stop being a teacher, so they can no longer run classes." : " They will stop being a student.";
              if (window.confirm(`Make ${selected.full_name || selected.email} an institution admin of ${institutionName}?${warn}`)) {
                setRole.mutate({ userId: selected.id, role: "institution_admin" });
              }
            }}
          >
            {setRole.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Appoint as admin
          </Button>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Or invite a new person by email</h3>
          <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Full name" maxLength={100} aria-label="Administrator name" autoComplete="off" />
          <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="admin@school.edu" maxLength={255} aria-label="Administrator email" autoComplete="off" />
          <Button type="button" variant="outline" disabled={busy || !inviteName.trim() || !inviteEmail.trim()} onClick={() => invite.mutate()}>
            {invite.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <UserPlus className="mr-2 size-4" />}Send invitation
          </Button>
          <p className="text-xs text-muted-foreground">They get an email to set their password and join as this institution's admin.</p>
        </div>
      </div>
    </section>
  );
}
