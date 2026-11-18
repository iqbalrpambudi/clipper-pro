import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:border-ring disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 font-semibold active:scale-[0.98] transition-transform",
        "workspace-primary":
          "rounded-xl border border-primary bg-primary font-semibold text-primary-foreground shadow-xs hover:border-primary dark:hover:border-primary/90 hover:bg-primary/90 active:scale-[0.98]",
        "workspace-secondary":
          "rounded-xl border border-border bg-card font-semibold text-secondary-foreground dark:text-foreground shadow-xs hover:bg-muted active:scale-[0.98]",
        "workspace-outline":
          "rounded-xl border border-input dark:border-border bg-transparent font-semibold text-secondary-foreground dark:text-foreground hover:bg-muted active:scale-[0.98]",
        "workspace-quiet":
          "rounded-lg font-semibold text-secondary-foreground dark:text-muted-foreground hover:bg-muted hover:text-foreground",
        "workspace-destructive":
          "rounded-lg border border-primary/30 dark:border-destructive/30 bg-accent dark:bg-destructive/15 font-semibold text-accent-foreground dark:text-rose-400 hover:bg-primary/15 dark:hover:bg-destructive/25",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 font-semibold active:scale-[0.98] transition-transform",
        outline:
          "border border-border bg-transparent font-semibold text-foreground shadow-xs hover:bg-surface-hover hover:text-foreground active:scale-[0.98] transition-transform",
        secondary:
          "bg-secondary text-secondary-foreground font-semibold shadow-xs hover:bg-secondary/80 active:scale-[0.98] transition-transform",
        ghost: "font-semibold hover:bg-surface-hover hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline font-semibold",
        supabase:
          "bg-primary text-primary-foreground font-semibold hover:bg-primary/90 shadow-xs active:scale-[0.98] transition-transform border border-primary/30",
      },
      size: {
        default: "h-9 px-4 text-xs font-semibold rounded-xl",
        sm: "h-8 px-3 text-xs font-semibold rounded-lg",
        xs: "h-7 px-2.5 text-xs font-semibold rounded-lg",
        lg: "h-11 px-6 text-xs font-semibold rounded-xl",
        icon: "h-9 w-9 text-xs font-semibold rounded-xl",
        "icon-sm": "h-8 w-8 text-xs font-semibold rounded-lg",
        "icon-xs": "h-7 w-7 text-xs font-semibold rounded-lg",
        "workspace-sm": "h-8 px-3 text-xs font-semibold rounded-lg",
        "workspace-md": "h-9 px-4 text-xs font-semibold rounded-xl",
        "workspace-lg": "h-11 px-5 text-xs font-semibold rounded-xl",
        workspace: "h-9 px-4 text-xs font-semibold rounded-xl",
        "workspace-icon": "h-9 w-9 p-0 text-xs font-semibold rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
