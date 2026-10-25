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
        "inline-flex items-center justify-center gap-1.5 rounded-full border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C45B3A] dark:focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "min-h-8 px-3 text-[11px]" : "min-h-9 px-3.5 text-xs",
        selected === true
          ? "border-[#C45B3A] dark:border-primary bg-[#F8EEEA] dark:bg-primary/20 text-[#A9472C] dark:text-primary font-semibold"
          : "border-[#E5E1D7] dark:border-border bg-[#FBFAF7] dark:bg-card text-[#5E5C54] dark:text-muted-foreground hover:border-[#D8CFC2] dark:hover:border-border/80 hover:bg-[#F1EEE6] dark:hover:bg-muted hover:text-[#26251F] dark:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
);
WorkspaceChip.displayName = "WorkspaceChip";

export { WorkspaceChip };
