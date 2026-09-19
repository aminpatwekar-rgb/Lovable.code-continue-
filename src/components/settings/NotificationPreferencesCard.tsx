import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Bell, Mail, Clock, FileCheck, Megaphone } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function NotificationPreferencesCard() {
  const { role } = useAuth();
  const { effectiveRole } = useViewRole();

  // NOTE: Persistence currently uses local state because there is no dedicated
  // 'user_preferences' table in the database schema yet. When a user_preferences table
  // is added with columns like (user_id, email_new_assignments, email_due_reminders, etc.),
  // these toggles can be wired directly to Supabase queries.
  const [notifyNewAssignments, setNotifyNewAssignments] = useState(true);
  const [notifyDeadlines, setNotifyDeadlines] = useState(true);
  const [notifySubmissions, setNotifySubmissions] = useState(true);
  const [notifyGradingDigest, setNotifyGradingDigest] = useState(false);
  const [notifyAnnouncements, setNotifyAnnouncements] = useState(true);

  const handleToggle = (name: string, setter: (val: boolean) => void, val: boolean) => {
    setter(val);
    toast.success(`${name} preference updated (session preview)`);
  };

  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";

  return (
    <Card className="lift transition-colors duration-200 hover:lift-hover">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-5 text-primary" />
          Notification Preferences
        </CardTitle>
        <CardDescription>
          Configure which notifications and email updates you want to receive.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {!isTeacher ? (
              /* Student specific notifications */
              <motion.div
                key="student-group"
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-4"
              >
                <motion.div
                  layout
                  className="flex items-center justify-between rounded-lg border border-border/70 p-3.5 transition-colors hover:bg-muted/40"
                >
                  <div className="space-y-0.5 pr-4">
                    <div className="flex items-center gap-2">
                      <Mail className="size-4 text-muted-foreground" />
                      <Label
                        htmlFor="notify-assignments"
                        className="text-sm font-medium cursor-pointer"
                      >
                        New Assignment Alerts
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground pl-6">
                      Receive an email when your teachers post new assignments or homework.
                    </p>
                  </div>
                  <Switch
                    id="notify-assignments"
                    checked={notifyNewAssignments}
                    onCheckedChange={(checked) =>
                      handleToggle("New assignment notifications", setNotifyNewAssignments, checked)
                    }
                  />
                </motion.div>

                <motion.div
                  layout
                  className="flex items-center justify-between rounded-lg border border-border/70 p-3.5 transition-colors hover:bg-muted/40"
                >
                  <div className="space-y-0.5 pr-4">
                    <div className="flex items-center gap-2">
                      <Clock className="size-4 text-muted-foreground" />
                      <Label
                        htmlFor="notify-deadlines"
                        className="text-sm font-medium cursor-pointer"
                      >
                        Deadline Reminders
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground pl-6">
                      Get an email reminder 24 hours before an assignment or quiz is due.
                    </p>
                  </div>
                  <Switch
                    id="notify-deadlines"
                    checked={notifyDeadlines}
                    onCheckedChange={(checked) =>
                      handleToggle("Deadline reminder", setNotifyDeadlines, checked)
                    }
                  />
                </motion.div>
              </motion.div>
            ) : (
              /* Teacher / Admin specific notifications */
              <motion.div
                key="teacher-group"
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-4"
              >
                <motion.div
                  layout
                  className="flex items-center justify-between rounded-lg border border-border/70 p-3.5 transition-colors hover:bg-muted/40"
                >
                  <div className="space-y-0.5 pr-4">
                    <div className="flex items-center gap-2">
                      <FileCheck className="size-4 text-muted-foreground" />
                      <Label
                        htmlFor="notify-submissions"
                        className="text-sm font-medium cursor-pointer"
                      >
                        Student Submission Alerts
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground pl-6">
                      Receive an email notification whenever a student submits or updates their
                      work.
                    </p>
                  </div>
                  <Switch
                    id="notify-submissions"
                    checked={notifySubmissions}
                    onCheckedChange={(checked) =>
                      handleToggle("Student submission alerts", setNotifySubmissions, checked)
                    }
                  />
                </motion.div>

                <motion.div
                  layout
                  className="flex items-center justify-between rounded-lg border border-border/70 p-3.5 transition-colors hover:bg-muted/40"
                >
                  <div className="space-y-0.5 pr-4">
                    <div className="flex items-center gap-2">
                      <Mail className="size-4 text-muted-foreground" />
                      <Label
                        htmlFor="notify-grading-digest"
                        className="text-sm font-medium cursor-pointer"
                      >
                        Weekly Grading Digest
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground pl-6">
                      Receive a weekly summary email of all pending submissions needing review.
                    </p>
                  </div>
                  <Switch
                    id="notify-grading-digest"
                    checked={notifyGradingDigest}
                    onCheckedChange={(checked) =>
                      handleToggle("Weekly grading digest", setNotifyGradingDigest, checked)
                    }
                  />
                </motion.div>
              </motion.div>
            )}

            {/* Common notification */}
            <motion.div
              key="common-announcements"
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ delay: 0.07, duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center justify-between rounded-lg border border-border/70 p-3.5 transition-colors hover:bg-muted/40"
            >
              <div className="space-y-0.5 pr-4">
                <div className="flex items-center gap-2">
                  <Megaphone className="size-4 text-muted-foreground" />
                  <Label
                    htmlFor="notify-announcements"
                    className="text-sm font-medium cursor-pointer"
                  >
                    Class Announcements
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  Receive important class bulletin notifications and schedule changes.
                </p>
              </div>
              <Switch
                id="notify-announcements"
                checked={notifyAnnouncements}
                onCheckedChange={(checked) =>
                  handleToggle("Announcement notifications", setNotifyAnnouncements, checked)
                }
              />
            </motion.div>
          </AnimatePresence>
        </div>

        <p className="text-xs text-muted-foreground italic">
          * Notifications are configured for this session. Persistent multi-device delivery will
          link to your email upon cloud provider integration.
        </p>
      </CardContent>
    </Card>
  );
}
