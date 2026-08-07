import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/achievements")({
  head: () => ({
    meta: [
      { title: "Achievements — ONYX" },
      { name: "description", content: "Badges you have earned in ONYX." },
      { property: "og:title", content: "Achievements — ONYX" },
      { property: "og:description", content: "Badges you have earned in ONYX." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="panel space-y-2 p-10 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Achievements</h1>
      <p className="text-sm text-muted-foreground">
        This screen is being built next — the data model behind it is already live.
      </p>
    </div>
  );
}
