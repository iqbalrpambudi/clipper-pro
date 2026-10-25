import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/15 text-primary border-primary/20",
        secondary: "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive",
        outline: "text-foreground border-border",
        workspace: "border-[#E5E1D7] dark:border-border bg-[#F1EEE6] dark:bg-muted text-[#5E5C54] dark:text-muted-foreground",
        "workspace-accent": "border-[#E9C9BD] dark:border-primary/30 bg-[#F8EEEA] dark:bg-primary/15 text-[#A9472C] dark:text-primary",
        "workspace-success": "border-[#C9DDCF] dark:border-emerald-800/40 bg-[#ECF3EB] dark:bg-emerald-950/40 text-[#456A4E] dark:text-emerald-400",
        "workspace-warning": "border-[#E8D9BC] dark:border-amber-800/40 bg-[#F7EFE0] dark:bg-amber-950/40 text-[#8A6A2F] dark:text-amber-400",
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
