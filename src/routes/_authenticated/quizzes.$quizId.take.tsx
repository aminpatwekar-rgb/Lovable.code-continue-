import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/quizzes/$quizId/take")({
  head: () => ({
    meta: [
      { title: "Take quiz — ONYX" },
      { name: "description", content: "Attempt a quiz in ONYX." },
      { property: "og:title", content: "Take quiz — ONYX" },
      { property: "og:description", content: "Attempt a quiz in ONYX." },
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
      <h1 className="text-xl font-semibold tracking-tight">Take quiz</h1>
      <p className="text-sm text-muted-foreground">
        This screen is being built next — the data model behind it is already live.
      </p>
    </div>
  );
}
