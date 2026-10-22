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
        workspace: "border-[#E5E1D7] bg-[#F1EEE6] text-[#5E5C54]",
        "workspace-accent": "border-[#E9C9BD] bg-[#F8EEEA] text-[#A9472C]",
        "workspace-success": "border-[#C9DDCF] bg-[#ECF3EB] text-[#456A4E]",
        "workspace-warning": "border-[#E8D9BC] bg-[#F7EFE0] text-[#8A6A2F]",
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
