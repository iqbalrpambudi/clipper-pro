import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
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
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
