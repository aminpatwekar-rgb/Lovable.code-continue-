import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, User, Building } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { JoinWithCode } from "@/components/institution/JoinWithCode";

export function ProfileSettingsCard() {
  const { user, profile, role, refresh } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [saving, setSaving] = useState(false);

  // Sync state when profile loads or updates
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
    }
  }, [profile]);

  const initials = (profile?.full_name || profile?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const canJoinInstitution = role === "teacher" || role === "student";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      toast.error("Full name cannot be empty");
      return;
    }

    setSaving(true);
    try {
      const updatePayload = { full_name: trimmedName };

      const { error } = await supabase.from("profiles").update(updatePayload).eq("id", user.id);

      if (error) {
        toast.error(error.message || "Failed to update profile");
      } else {
        await refresh();
        toast.success("Profile updated successfully");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="lift transition-colors duration-200 hover:lift-hover">
      <CardHeader>
        <CardTitle>Profile Details</CardTitle>
        <CardDescription>Update your display name and academic affiliation.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-6">
          {/* Avatar and Info Header */}
          <div className="flex items-center gap-4">
            <Avatar className="size-16 border border-border/60">
              <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {profile?.full_name || "Account Profile"}
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                {role ?? "User"} · Avatar generated from initials
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="full_name" className="text-sm font-medium">
                Full Name
              </Label>
              <div className="relative">
                <Input
                  id="full_name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  required
                  disabled={saving}
                  className="pl-9"
                />
                <User className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Institution</Label>
              <div className="relative">
                <Input
                  value={profile?.institution ?? "Not part of an institution yet"}
                  readOnly
                  disabled
                  className="pl-9"
                />
                <Building className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              </div>
              {!profile?.institution && canJoinInstitution && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    Got a join link or code from your institution? Enter it here.
                  </p>
                  <JoinWithCode />
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving} className="gap-2">
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? "Saving changes..." : "Save Profile"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
