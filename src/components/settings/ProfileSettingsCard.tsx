import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Loader2, User, Building, Camera } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function ProfileSettingsCard() {
  const { user, profile, role, refresh } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

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


  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Profile photos must be 5 MB or smaller.");
      return;
    }

    setUploadingAvatar(true);
    try {
      const avatarPath = `${user.id}/avatar`;
      const { error: uploadError } = await supabase.storage
        .from("profile-avatars")
        .upload(avatarPath, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("profile-avatars").getPublicUrl(avatarPath);
      const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", user.id);
      if (profileError) throw profileError;

      await refresh();
      toast.success("Profile photo updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload your profile photo.");
    } finally {
      setUploadingAvatar(false);
    }
  }

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
              <AvatarImage src={profile?.avatar_url ?? undefined} alt={`${profile?.full_name || "User"} profile photo`} />
              <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {profile?.full_name || "Account Profile"}
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                {role ?? "User"} · Upload a profile photo from your device
              </p>
              <div className="mt-2">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAvatarUpload}
                  disabled={uploadingAvatar}
                  className="hidden"
                  aria-label="Choose a profile photo"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar || saving}
                  className="gap-2"
                >
                  {uploadingAvatar ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
                  {uploadingAvatar ? "Uploading photo..." : "Change photo"}
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">JPG, PNG or WebP · Up to 5 MB</p>
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
                  value={profile?.institution ?? "Not part of an institution"}
                  readOnly
                  disabled
                  className="pl-9"
                />
                <Building className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              </div>
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
