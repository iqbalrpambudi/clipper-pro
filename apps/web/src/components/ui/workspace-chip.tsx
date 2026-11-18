import * as React from "react";
import { cn } from "@/lib/utils";

export type WorkspaceChipProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-pressed"
> & {
  selected?: boolean;
  size?: "sm" | "md";
};

const WorkspaceChip = React.forwardRef<HTMLButtonElement, WorkspaceChipProps>(
  ({ className, selected, size = "sm", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "min-h-8 px-3 text-xs" : "min-h-9 px-3.5 text-xs",
        selected === true
          ? "border-primary bg-accent dark:bg-primary/20 text-accent-foreground dark:text-primary font-semibold"
          : "border-border bg-card text-secondary-foreground dark:text-muted-foreground hover:border-input dark:hover:border-border/80 hover:bg-muted hover:text-foreground",
        className
      )}
      {...props}
    />
  )
);
WorkspaceChip.displayName = "WorkspaceChip";

export { WorkspaceChip };
