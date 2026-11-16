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
        workspace: "border-border bg-muted text-secondary-foreground dark:text-muted-foreground",
        "workspace-accent": "border-primary/30 bg-accent dark:bg-primary/15 text-accent-foreground dark:text-primary",
        "workspace-success": "border-emerald-500/30 dark:border-emerald-800/40 bg-emerald-500/10 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400",
        "workspace-warning": "border-amber-500/30 dark:border-amber-800/40 bg-amber-500/10 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400",
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
