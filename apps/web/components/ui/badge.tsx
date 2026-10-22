import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/15 text-primary border-primary/20",
        supabase: "border-[#3ECF8E]/30 bg-[#3ECF8E]/10 text-[#3ECF8E]",
        secondary: "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive",
        warning: "border-amber-500/30 bg-amber-500/10 text-amber-400",
        outline: "text-foreground border-border",
        success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
        workspace: "border-[#E5E1D7] bg-[#F1EEE6] text-[#5E5C54]",
        "workspace-accent": "border-[#E9C9BD] bg-[#F8EEEA] text-[#A9472C]",
        "workspace-success": "border-[#C9DDCF] bg-[#ECF3EB] text-[#456A4E]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
