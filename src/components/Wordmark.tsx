import { cn } from "@/lib/utils";

export function Wordmark({
  size = "md",
  subtitle,
  className,
}: {
  size?: "sm" | "md";
  subtitle?: string;
  className?: string;
}) {
  const box = size === "sm" ? "size-9 text-base rounded-lg" : "size-11 text-lg rounded-xl";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center bg-primary font-black text-primary-foreground",
          box,
        )}
      >
        O
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-lg font-bold tracking-tight">ONYX</span>
        {subtitle && (
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
    </div>
  );
}
