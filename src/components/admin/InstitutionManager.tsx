import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, CalendarDays, Download, FileUp, Plus, Search, Trash2, Users, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchProfileEmails } from "@/lib/profile-emails";
import { csvObjects, downloadCsv, toCsv } from "@/lib/csv";
import { assignInstitutionMembers, bulkCreateInstitutionStudents, deleteInstitution, removeInstitutionMember, updateInstitutionDetails, type StudentOnboardingResult } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const db = supabase as any;

type InstitutionRow = { id: string; name: string; code: string | null; city: string | null; created_at: string };
type InstitutionPerson = {
  id: string; full_name: string; email: string; institution: string | null;
  is_active: boolean; role: "student" | "teacher" | "institution_admin" | "admin" | "unknown";
};
type RosterResult = { assigned: number; skipped: number; skippedRows: { email: string; reason: string }[] };

export function InstitutionManager() {
  const { role, user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "admin";
  const assignMembersFn = useServerFn(assignInstitutionMembers);
  const updateInstitutionFn = useServerFn(updateInstitutionDetails);
  const removeMemberFn = useServerFn(removeInstitutionMember);
  const deleteInstitutionFn = useServerFn(deleteInstitution);
  const bulkCreateStudentsFn = useServerFn(bulkCreateInstitutionStudents);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [city, setCity] = useState("");
  const [activeInstitutionId, setActiveInstitutionId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editCity, setEditCity] = useState("");
  const [personSearch, setPersonSearch] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [csv, setCsv] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<InstitutionRow | null>(null);
  const [lastResult, setLastResult] = useState<RosterResult | null>(null);
  const [studentOnboardingResult, setStudentOnboardingResult] = useState<StudentOnboardingResult | null>(null);

  const institutions = useQuery({
    enabled: isAdmin,
    queryKey: ["admin-institutions"],
    queryFn: async (): Promise<InstitutionRow[]> => {
      const { data, error } = await db.from("institutions")
        .select("id, name, code, city, created_at").order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as InstitutionRow[];
    },
  });

  const people = useQuery({
    enabled: isAdmin,
    queryKey: ["admin-institution-people"],
    queryFn: async (): Promise<InstitutionPerson[]> => {
      const [{ data: profiles, error: profileError }, { data: roleRows, error: rolesError }] = await Promise.all([
        db.from("profiles").select("id, full_name, institution, is_active, created_at").order("full_name", { ascending: true }),
        db.from("user_roles").select("user_id, role"),
      ]);
      if (profileError) throw profileError;
      if (rolesError) throw rolesError;
      const emails = await fetchProfileEmails((profiles ?? []).map((profile: { id: string }) => profile.id));
      const rolesById = new Map<string, string[]>();
      for (const row of roleRows ?? []) {
        const list = rolesById.get(row.user_id) ?? [];
        list.push(row.role);
        rolesById.set(row.user_id, list);
      }
      return (profiles ?? []).map((profile: any) => {
        const userRoles = rolesById.get(profile.id) ?? [];
        const resolved: InstitutionPerson["role"] = userRoles.includes("admin") ? "admin"
          : userRoles.includes("institution_admin") ? "institution_admin"
          : userRoles.includes("teacher") ? "teacher"
          : userRoles.includes("student") ? "student" : "unknown";
        return {
          id: profile.id,
          full_name: profile.full_name ?? "",
          email: emails.get(profile.id) ?? "",
          institution: typeof profile.institution === "string" ? profile.institution.trim() || null : null,
          is_active: profile.is_active !== false,
          role: resolved,
        };
      });
    },
  });

  const activeInstitution = institutions.data?.find((item) => item.id === activeInstitutionId) ?? null;
  useEffect(() => {
    if (!activeInstitution) {
      setEditName(""); setEditCode(""); setEditCity("");
      return;
    }
    setEditName(activeInstitution.name);
    setEditCode(activeInstitution.code ?? "");
    setEditCity(activeInstitution.city ?? "");
    setSelectedPeople([]);
    setCsv("");
    setCsvFileName("");
    setStudentOnboardingResult(null);
    setPersonSearch("");
    setLastResult(null);
  }, [activeInstitution]);

  const createInstitution = useMutation({
    mutationFn: async () => {
      const cleanName = name.trim();
      if (!cleanName) throw new Error("Enter an institution name.");
      const { data, error } = await db.from("institutions").insert({
        name: cleanName, code: code.trim() || null, city: city.trim() || null, created_by: user?.id ?? null,
      }).select("id").single();
      if (error) {
        if (error.code === "23505") throw new Error("An institution with that name already exists.");
        throw error;
      }
      return data as { id: string };
    },
    onSuccess: async (created) => {
      setName(""); setCode(""); setCity("");
      setActiveInstitutionId(created.id);
      toast.success("Institution created. Next, add students and staff.");
      await qc.invalidateQueries({ queryKey: ["admin-institutions"] });
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't create the institution."),
  });

  const saveDetails = useMutation({
    mutationFn: () => updateInstitutionFn({ data: {
      institutionId: activeInstitution!.id, name: editName, code: editCode, city: editCity,
    }}),
    onSuccess: async () => {
      toast.success("Institution details saved.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-institutions"] }),
        qc.invalidateQueries({ queryKey: ["admin-institution-people"] }),
        qc.invalidateQueries({ queryKey: ["institution-readiness"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't save institution details."),
  });

  const assignMembers = useMutation({
    mutationFn: (payload: { userIds?: string[]; emails?: string[] }) => assignMembersFn({
      data: { institutionId: activeInstitution!.id, ...payload },
    }),
    onSuccess: async (result) => {
      setSelectedPeople([]); setLastResult(result);
      if (result.assigned) toast.success("Added " + result.assigned + " member(s).");
      else toast.info("No new members were added. Review the results below.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-institution-people"] }),
        qc.invalidateQueries({ queryKey: ["institution-readiness"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't add members."),
  });

  const bulkOnboardStudents = useMutation({
    mutationFn: () => {
      if (!activeInstitution) throw new Error("Select an institution first.");
      return bulkCreateStudentsFn({ data: { institutionId: activeInstitution.id, csv, redirectTo: `${window.location.origin}/reset-password` } });
    },
    onSuccess: async (result) => {
      setStudentOnboardingResult(result);
      const summary = [
        result.invited ? `${result.invited} new invite(s) sent` : "",
        result.assignedExisting ? `${result.assignedExisting} existing student(s) added` : "",
        result.alreadyAssigned ? `${result.alreadyAssigned} already assigned` : "",
        result.inviteFailed ? `${result.inviteFailed} invitation(s) failed` : "",
        result.setupFailed ? `${result.setupFailed} setup issue(s)` : "",
        result.skipped ? `${result.skipped} skipped` : "",
      ].filter(Boolean).join(" · ");
      if (result.inviteFailed || result.setupFailed || result.skipped) {
        toast.info("Student onboarding finished with items to review. " + summary);
      } else if (result.invited || result.assignedExisting) {
        toast.success("Institution onboarding completed. " + summary);
      } else {
        toast.info("No new changes were needed. " + summary);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-institution-people"] }),
        qc.invalidateQueries({ queryKey: ["institution-readiness"] }),
        qc.invalidateQueries({ queryKey: ["admin-institutions"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || "Bulk institution onboarding failed."),
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => removeMemberFn({ data: { institutionId: activeInstitution!.id, userId } }),
    onSuccess: async () => {
      toast.success("Member removed. Their ONYX account and work were preserved.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-institution-people"] }),
        qc.invalidateQueries({ queryKey: ["institution-readiness"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't remove this member."),
  });

  const deleteSelectedInstitution = useMutation({
    mutationFn: (institutionId: string) => deleteInstitutionFn({ data: { institutionId } }),
    onSuccess: async (result, id) => {
      toast.success("Institution deleted. " + result.clearedMembers + " affiliation(s) cleared; accounts and class work were preserved.");
      if (activeInstitutionId === id) setActiveInstitutionId(null);
      setDeleteTarget(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-institutions"] }),
        qc.invalidateQueries({ queryKey: ["admin-institution-people"] }),
        qc.invalidateQueries({ queryKey: ["institution-readiness"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't delete institution."),
  });

  const currentMembers = useMemo(() => {
    if (!activeInstitution) return [];
    const institutionName = activeInstitution.name.trim().toLowerCase();
    return (people.data ?? []).filter((person) =>
      person.institution?.toLowerCase() === institutionName &&
      (person.role === "student" || person.role === "teacher" || person.role === "institution_admin"),
    );
  }, [activeInstitution, people.data]);

  const availablePeople = useMemo(() => {
    const currentIds = new Set(currentMembers.map((person) => person.id));
    const query = personSearch.trim().toLowerCase();
    return (people.data ?? []).filter((person) => {
      if (person.role !== "student" && person.role !== "teacher" && person.role !== "institution_admin") return false;
      if (!person.is_active || currentIds.has(person.id)) return false;
      return !query || person.full_name.toLowerCase().includes(query) || person.email.toLowerCase().includes(query);
    });
  }, [currentMembers, people.data, personSearch]);

  const csvRowCount = useMemo(() => csvObjects(csv).length, [csv]);

  const togglePerson = (id: string, checked: boolean) => setSelectedPeople((current) =>
    checked ? [...new Set([...current, id])] : current.filter((item) => item !== id),
  );

  if (!isAdmin) {
    return <section className="panel p-6">
      <h2 className="font-semibold">Platform admins only</h2>
      <p className="mt-1 text-sm text-muted-foreground">Only a platform administrator can create or manage institutions.</p>
    </section>;
  }

  return <div className="space-y-5">
    <header>
      <h2 className="text-xl font-semibold">Institution directory</h2>
      <p className="mt-1 text-sm text-muted-foreground">Create institutions, edit their details, and manage student/staff rosters.</p>
    </header>

    <section className="panel space-y-4 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2"><Building2 className="size-5 text-primary" /></div>
        <div><h3 className="font-semibold">Create an institution</h3>
          <p className="mt-1 text-sm text-muted-foreground">Creating an institution does not create accounts or grant administrator access.</p>
        </div>
      </div>
      <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => { event.preventDefault(); createInstitution.mutate(); }}>
        <div className="space-y-1.5 sm:col-span-2"><label htmlFor="new-institution-name" className="text-sm font-medium">Institution name *</label>
          <Input id="new-institution-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Example University" required maxLength={160} autoComplete="organization" /></div>
        <div className="space-y-1.5"><label htmlFor="new-institution-code" className="text-sm font-medium">Code (optional)</label>
          <Input id="new-institution-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. EXU" maxLength={40} /></div>
        <div className="space-y-1.5"><label htmlFor="new-institution-city" className="text-sm font-medium">City (optional)</label>
          <Input id="new-institution-city" value={city} onChange={(event) => setCity(event.target.value)} placeholder="e.g. Pune" maxLength={100} /></div>
        <div className="sm:col-span-2 lg:col-span-4"><Button type="submit" disabled={!name.trim() || createInstitution.isPending}>
          <Plus className="mr-2 size-4" />{createInstitution.isPending ? "Creating…" : "Create institution"}
        </Button></div>
      </form>
    </section>

    <section className="panel space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-semibold">Registered institutions</h3>
          <p className="mt-1 text-sm text-muted-foreground">{institutions.data?.length ?? 0} institution(s) in the directory.</p></div>
        <Button variant="outline" size="sm" onClick={() => void Promise.all([institutions.refetch(), people.refetch()])}>Refresh directory</Button>
      </div>
      {institutions.isLoading ? <div className="space-y-3"><Skeleton className="h-14 w-full rounded-lg" /><Skeleton className="h-14 w-full rounded-lg" /></div>
        : institutions.isError ? <div className="rounded-lg border border-destructive/30 p-4">
          <p className="text-sm text-destructive">Couldn't load institutions. Check that the table and admin-only RLS policy are applied.</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => void institutions.refetch()}>Retry</Button></div>
        : !institutions.data?.length ? <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Building2 className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">No institutions yet</p><p className="mt-1 text-sm text-muted-foreground">Create the first institution above.</p></div>
        : <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full min-w-[48rem] text-sm">
          <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>
            <th className="p-3 font-medium">Institution</th><th className="p-3 font-medium">Code</th><th className="p-3 font-medium">City</th><th className="p-3 font-medium">Members</th><th className="p-3 font-medium">Created</th><th className="p-3 text-right font-medium">Actions</th>
          </tr></thead><tbody className="divide-y divide-border">{institutions.data.map((institution) => {
            const count = (people.data ?? []).filter((person) => person.institution?.toLowerCase() === institution.name.trim().toLowerCase() && (person.role === "student" || person.role === "teacher" || person.role === "institution_admin")).length;
            return <tr key={institution.id} className={activeInstitutionId === institution.id ? "bg-muted/40" : "hover:bg-muted/30"}>
              <td className="p-3 font-medium">{institution.name}</td><td className="p-3 text-muted-foreground">{institution.code || "—"}</td>
              <td className="p-3 text-muted-foreground">{institution.city || "—"}</td><td className="p-3 tabular-nums">{count}</td>
              <td className="p-3 text-muted-foreground">{new Date(institution.created_at).toLocaleDateString()}</td>
              <td className="p-3"><div className="flex justify-end gap-2">
                <Button size="sm" variant={activeInstitutionId === institution.id ? "default" : "outline"} onClick={() => setActiveInstitutionId(institution.id)}>Manage</Button>
                <Button size="sm" variant="destructive" aria-label={"Delete " + institution.name} onClick={() => setDeleteTarget(institution)}><Trash2 className="size-4" /></Button>
              </div></td>
            </tr>;
          })}</tbody>
        </table></div>}
    </section>

    {activeInstitution && <section className="panel space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="flex items-center gap-2 font-semibold"><Building2 className="size-4" />{activeInstitution.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">Edit institution settings, manage members, or import a roster.</p></div>
        <Button size="sm" variant="outline" onClick={() => setActiveInstitutionId(null)}><X className="mr-2 size-4" />Close</Button>
      </div>

      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(event) => { event.preventDefault(); saveDetails.mutate(); }}>
        <div className="space-y-1.5"><label htmlFor="edit-institution-name" className="text-sm font-medium">Institution name</label>
          <Input id="edit-institution-name" value={editName} onChange={(event) => setEditName(event.target.value)} required maxLength={160} /></div>
        <div className="space-y-1.5"><label htmlFor="edit-institution-code" className="text-sm font-medium">Institution code</label>
          <Input id="edit-institution-code" value={editCode} onChange={(event) => setEditCode(event.target.value)} maxLength={40} /></div>
        <div className="space-y-1.5"><label htmlFor="edit-institution-city" className="text-sm font-medium">City</label>
          <Input id="edit-institution-city" value={editCity} onChange={(event) => setEditCity(event.target.value)} maxLength={100} /></div>
        <div className="sm:col-span-2 lg:col-span-3"><Button type="submit" disabled={!editName.trim() || saveDetails.isPending}>{saveDetails.isPending ? "Saving…" : "Save institution details"}</Button></div>
      </form>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-3">
          <div><h4 className="flex items-center gap-2 font-semibold"><Users className="size-4" />Roster ({currentMembers.length})</h4>
            <p className="mt-1 text-sm text-muted-foreground">Remove a roster member without deleting their ONYX account or work.</p></div>
          {people.isLoading ? <Skeleton className="h-32 w-full rounded-lg" /> : people.isError ? <p className="text-sm text-destructive">Could not load the member roster. Refresh the directory and retry.</p>
            : currentMembers.length === 0 ? <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">No members yet. Add students or teachers from the account list.</p>
            : <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full min-w-[30rem] text-sm">
              <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>
                <th className="p-2.5 font-medium">Name</th><th className="p-2.5 font-medium">Email</th><th className="p-2.5 font-medium">Role</th><th className="p-2.5 text-right font-medium">Action</th>
              </tr></thead><tbody className="divide-y divide-border">{currentMembers.map((person) => <tr key={person.id}>
                <td className="p-2.5 font-medium">{person.full_name || "Unnamed"}</td><td className="p-2.5 text-muted-foreground">{person.email || "—"}</td>
                <td className="p-2.5 capitalize">{person.role}</td><td className="p-2.5 text-right">
                  <Button size="sm" variant="outline" disabled={removeMember.isPending} onClick={() => removeMember.mutate(person.id)}>Remove</Button>
                </td></tr>)}</tbody></table></div>}
        </section>

        <section className="space-y-3">
          <div><h4 className="flex items-center gap-2 font-semibold"><UserPlus className="size-4" />Add students and staff</h4>
            <p className="mt-1 text-sm text-muted-foreground">Choose active registered ONYX accounts. Assigning a person changes institution affiliation but preserves their role.</p></div>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={personSearch} onChange={(event) => setPersonSearch(event.target.value)} placeholder="Search by name or email" aria-label="Search accounts to add" /></div>
          {people.isLoading ? <Skeleton className="h-28 w-full rounded-lg" /> : availablePeople.length === 0
            ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No matching active student/staff accounts.</p>
            : <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {availablePeople.slice(0, 150).map((person) => <label key={person.id} className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/40">
                <input type="checkbox" className="size-4 accent-primary" checked={selectedPeople.includes(person.id)} onChange={(event) => togglePerson(person.id, event.target.checked)} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{person.full_name || "Unnamed account"}</span>
                  <span className="block truncate text-xs text-muted-foreground">{person.email || "No email"} · {person.role}{person.institution ? " · Currently: " + person.institution : ""}</span></span>
              </label>)}
              {availablePeople.length > 150 && <p className="p-2 text-xs text-muted-foreground">Showing 150 results. Refine your search to find others.</p>}
            </div>}
          <Button disabled={!selectedPeople.length || assignMembers.isPending} onClick={() => assignMembers.mutate({ userIds: selectedPeople })}>
            <UserPlus className="mr-2 size-4" />{assignMembers.isPending ? "Adding…" : "Add selected (" + selectedPeople.length + ")"}
          </Button>

          {lastResult && <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Last manual roster action: {lastResult.assigned} added · {lastResult.skipped} skipped</p>
            {lastResult.skippedRows.length > 0 && <div className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
              {lastResult.skippedRows.map((row, index) => <p key={row.email + "-" + index}>{row.email}: {row.reason}</p>)}
            </div>}
          </div>}

          <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/[0.03] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h5 className="text-sm font-semibold">Bulk student account onboarding</h5>
              <Button type="button" size="sm" variant="outline" onClick={() => downloadCsv(
                "onyx-institution-roster-template.csv",
                toCsv(
                  ["full_name", "email", "role"],
                  [
                    ["Aarav Sharma", "aarav@example.edu", "student"],
                    ["Dr. Asha Mehta", "asha@college.edu", "teacher"],
                    ["Campus Administrator", "admin.office@college.edu", "institution_admin"],
                  ],
                ),
              )}><Download className="mr-2 size-4" />Download CSV template</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Upload up to 500 people with <code>full_name,email,role</code>. Use <code>student</code>, <code>teacher</code>, or <code>institution_admin</code>. ONYX creates missing accounts, assigns the selected role, links the account to this institution, and emails an invitation to set their own password. Existing accounts are linked only when their role matches and they are not affiliated elsewhere. Passwords are never collected or shown.
            </p>
            <p className="rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
              <strong>Email setup required for mass imports:</strong> Supabase's built-in email sender is limited to 2 emails per hour and team-authorized addresses. Configure custom SMTP before inviting a full institution roster, and allow your ONYX <code>/reset-password</code> URL in Supabase Auth URL Configuration. <a className="underline underline-offset-2" href="https://supabase.com/docs/guides/auth/auth-smtp" target="_blank" rel="noreferrer">SMTP setup guide</a>.
            </p>
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <FileUp className="size-4" />Choose student CSV
              <input type="file" accept=".csv,text/csv" className="block max-w-full text-xs" onChange={async (event) => {
                const file = event.currentTarget.files?.[0]; if (!file) return;
                if (file.size > 2 * 1024 * 1024) { toast.error("CSV files must be 2 MB or smaller."); event.currentTarget.value = ""; return; }
                try { setCsvFileName(file.name); setCsv(await file.text()); setStudentOnboardingResult(null); }
                catch { toast.error("Couldn't read that CSV file."); }
                finally { event.currentTarget.value = ""; }
              }} />
            </label>
            {csvFileName && <p className="text-xs text-muted-foreground">Loaded: {csvFileName}</p>}
            <Textarea
              value={csv}
              onChange={(event) => { setCsv(event.target.value); setCsvFileName(""); setStudentOnboardingResult(null); }}
              rows={5}
              placeholder={"full_name,email,role\nAarav Sharma,aarav@college.edu,student\nDr. Asha Mehta,asha@college.edu,teacher\nCampus Administrator,admin.office@college.edu,institution_admin"}
              aria-label="Bulk student account onboarding CSV"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{csvRowCount} student row(s) detected · Required columns: full_name, email, role</p>
              <Button
                type="button"
                size="sm"
                disabled={!csvRowCount || bulkOnboardStudents.isPending}
                onClick={() => bulkOnboardStudents.mutate()}
              >
                <UserPlus className="mr-2 size-4" />
                {bulkOnboardStudents.isPending ? "Onboarding students…" : "Create accounts & send invites"}
              </Button>
            </div>
          </div>

          {studentOnboardingResult && <div className="space-y-3 rounded-lg border border-border p-4">
            <div>
              <h5 className="text-sm font-semibold">Bulk onboarding results</h5>
              <p className="mt-1 text-xs text-muted-foreground">
                {studentOnboardingResult.invited} invited · {studentOnboardingResult.assignedExisting} existing accounts added · {studentOnboardingResult.alreadyAssigned} already assigned · {studentOnboardingResult.inviteFailed} invite failures · {studentOnboardingResult.setupFailed} setup issues · {studentOnboardingResult.skipped} skipped
              </p>
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="w-full min-w-[34rem] text-left text-xs">
                <thead className="sticky top-0 border-b border-border bg-muted text-muted-foreground">
                  <tr><th className="p-2.5 font-medium">CSV row</th><th className="p-2.5 font-medium">Email</th><th className="p-2.5 font-medium">Status</th><th className="p-2.5 font-medium">Details</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {studentOnboardingResult.rows.map((row) => <tr key={row.line + "-" + row.email}>
                    <td className="p-2.5 tabular-nums">{row.line}</td>
                    <td className="p-2.5">{row.email}</td>
                    <td className="p-2.5 capitalize">{row.status.replaceAll("_", " ")}</td>
                    <td className="p-2.5 text-muted-foreground">{row.message}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </div>}
        </section>
      </div>
    </section>}

    {people.isError && <p className="text-sm text-destructive">Couldn't load user accounts. Check administrator access, then refresh.</p>}

    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleteSelectedInstitution.isPending) setDeleteTarget(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
          <AlertDialogDescription>This deletes the institution directory record and clears matching institution labels from profiles. It does not delete ONYX accounts, classes, assignments, submissions, or grades. This action cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={deleteSelectedInstitution.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={(event) => { event.preventDefault(); if (deleteTarget) deleteSelectedInstitution.mutate(deleteTarget.id); }} disabled={deleteSelectedInstitution.isPending}>
            {deleteSelectedInstitution.isPending ? "Deleting…" : "Delete institution"}
          </AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
