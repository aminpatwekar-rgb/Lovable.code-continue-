import { Fragment, useMemo } from "react";
import { MathPreview } from "@/components/math/MathPreview";
import { cn } from "@/lib/utils";

type MathTextPart =
  | { kind: "text"; value: string }
  | { kind: "inline" | "block"; value: string };

function splitMathText(value: string): MathTextPart[] {
  const parts: MathTextPart[] = [];
  const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ kind: "text", value: value.slice(cursor, index) });

    if (match[1] !== undefined) {
      parts.push({ kind: "block", value: match[1] });
    } else if (match[2] !== undefined) {
      parts.push({ kind: "inline", value: match[2] });
    }

    cursor = index + match[0].length;
  }

  if (cursor < value.length) parts.push({ kind: "text", value: value.slice(cursor) });
  return parts.length > 0 ? parts : [{ kind: "text", value }];
}

export function RenderMathText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => splitMathText(text), [text]);

  return (
    <div className={cn("whitespace-pre-wrap leading-7", className)}>
      {parts.map((part, index) => (
        <Fragment key={`${part.kind}-${index}`}>
          {part.kind === "text" ? (
            part.value
          ) : part.kind === "block" ? (
            <MathPreview latex={part.value} className="my-3" />
          ) : (
            <MathPreview
              latex={part.value}
              display={false}
              className="mx-0.5 inline-block max-w-full align-middle"
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}