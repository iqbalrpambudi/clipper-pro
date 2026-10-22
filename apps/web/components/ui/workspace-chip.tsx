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
        "inline-flex items-center justify-center gap-1.5 rounded-full border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C45B3A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FBFAF7] disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "min-h-8 px-3 text-[11px]" : "min-h-9 px-3.5 text-xs",
        selected === true
          ? "border-[#C45B3A] bg-[#F8EEEA] text-[#A9472C]"
          : "border-[#E5E1D7] bg-[#FBFAF7] text-[#5E5C54] hover:border-[#D8CFC2] hover:bg-[#F1EEE6] hover:text-[#26251F]",
        className
      )}
      {...props}
    />
  )
);
WorkspaceChip.displayName = "WorkspaceChip";

export { WorkspaceChip };
