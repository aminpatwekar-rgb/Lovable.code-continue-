import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/question-bank")({
  head: () => ({
    meta: [
      { title: "Question bank — ONYX" },
      { name: "description", content: "Reusable question library in ONYX." },
      { property: "og:title", content: "Question bank — ONYX" },
      { property: "og:description", content: "Reusable question library in ONYX." },
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
      <h1 className="text-xl font-semibold tracking-tight">Question bank</h1>
      <p className="text-sm text-muted-foreground">
        This screen is being built next — the data model behind it is already live.
      </p>
    </div>
  );
}
