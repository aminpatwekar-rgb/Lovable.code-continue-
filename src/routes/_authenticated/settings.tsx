import { createFileRoute } from "@tanstack/react-router";
import { Monitor, Moon, Sun, Check } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTheme, ACCENTS, type Accent, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — ONYX Appearance & Theme" },
      {
        name: "description",
        content:
          "Personalise ONYX: switch between light, dark or system themes and pick your accent colour.",
      },
      { property: "og:title", content: "Settings — ONYX Appearance & Theme" },
      {
        property: "og:description",
        content: "Choose your ONYX theme and accent colour.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const ACCENT_SWATCH: Record<Accent, { label: string; light: string; dark: string }> = {
  gold: { label: "Gold", light: "oklch(0.72 0.13 75)", dark: "oklch(0.75 0.13 78)" },
  sapphire: { label: "Sapphire", light: "oklch(0.6 0.14 250)", dark: "oklch(0.68 0.14 250)" },
  emerald: { label: "Emerald", light: "oklch(0.6 0.14 155)", dark: "oklch(0.68 0.14 155)" },
  rose: { label: "Rose", light: "oklch(0.62 0.18 20)", dark: "oklch(0.68 0.18 20)" },
};

const MODES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function SettingsPage() {
  const { theme, mode, setMode, accent, setAccent } = useTheme();

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Personalise how ONYX looks on this device.
          </p>
        </div>

        <Card className="lift transition-colors duration-200 hover:lift-hover">
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose a theme and accent colour.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="space-y-3">
              <p className="text-sm font-medium">Theme</p>
              <ToggleGroup
                type="single"
                value={mode}
                onValueChange={(v) => v && setMode(v as ThemeMode)}
                className="justify-start gap-2"
              >
                {MODES.map(({ value, label, icon: Icon }) => (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    aria-label={label}
                    className="gap-2 rounded-lg border border-border px-4 transition-colors duration-200 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    <Icon className="size-4" />
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">
                Currently showing the {theme} theme.
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Accent colour</p>
              <div className="flex flex-wrap items-center gap-4">
                {ACCENTS.map((a) => {
                  const swatch = ACCENT_SWATCH[a];
                  const selected = accent === a;
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAccent(a)}
                      aria-label={swatch.label}
                      aria-pressed={selected}
                      className={cn(
                        "flex size-10 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-all duration-200",
                        selected ? "ring-2 ring-foreground" : "hover:scale-105",
                      )}
                      style={{ backgroundColor: theme === "dark" ? swatch.dark : swatch.light }}
                    >
                      {selected && <Check className="size-4 text-background" />}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs capitalize text-muted-foreground">{accent} selected</p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Preview</p>
              <div className="panel lift space-y-3 p-4 transition-colors duration-200">
                <span className="brand-gradient inline-flex size-9 items-center justify-center rounded-lg text-sm font-bold text-primary-foreground">
                  O
                </span>
                <p className="text-sm text-muted-foreground">
                  This is how cards, text and buttons look with your current selection.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="transition-colors duration-200">
                    Primary action
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="transition-colors duration-200"
                  >
                    Secondary
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
