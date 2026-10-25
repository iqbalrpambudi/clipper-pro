import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90 font-semibold active:scale-[0.98] transition-transform",
        "workspace-primary":
          "rounded-xl border border-[#C45B3A] dark:border-primary bg-[#C45B3A] dark:bg-primary px-4 font-semibold text-[#FFFAF6] shadow-sm hover:border-[#A9472C] dark:hover:border-primary/90 hover:bg-[#A9472C] dark:hover:bg-primary/90 active:scale-[0.98]",
        "workspace-secondary":
          "rounded-xl border border-[#E5E1D7] dark:border-border bg-[#FBFAF7] dark:bg-card px-4 font-semibold text-[#4D4A42] dark:text-foreground shadow-sm hover:bg-[#F1EEE6] dark:hover:bg-muted active:scale-[0.98]",
        "workspace-outline":
          "rounded-xl border border-[#D2CDBF] dark:border-border bg-transparent px-4 font-semibold text-[#4D4A42] dark:text-foreground hover:bg-[#F1EEE6] dark:hover:bg-muted active:scale-[0.98]",
        "workspace-quiet":
          "rounded-lg px-3 font-semibold text-[#5E5C54] dark:text-muted-foreground hover:bg-[#F1EEE6] dark:hover:bg-muted hover:text-[#26251F] dark:hover:text-foreground",
        "workspace-destructive":
          "rounded-lg border border-[#E9C9BD] dark:border-destructive/30 bg-[#F8EEEA] dark:bg-destructive/15 px-3 font-semibold text-[#A9472C] dark:text-rose-400 hover:bg-[#F3E1D9] dark:hover:bg-destructive/25",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:scale-[0.98] transition-transform",
        outline:
          "border border-border bg-transparent shadow-sm hover:bg-surface-hover hover:text-foreground active:scale-[0.98] transition-transform",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 active:scale-[0.98] transition-transform",
        ghost: "hover:bg-surface-hover hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        supabase:
          "bg-primary text-primary-foreground font-semibold hover:bg-primary/90 shadow-sm active:scale-[0.98] transition-transform border border-primary/30",
      },
      size: {
        default: "h-9 px-4 py-2 text-sm",
        sm: "h-8 rounded-md px-3 text-xs",
        xs: "h-7 rounded-md px-2.5 text-xs",
        lg: "h-10 rounded-md px-6 text-base",
        icon: "h-9 w-9",
        "icon-sm": "h-7 w-7",
        "workspace-sm": "h-8 px-3 text-xs",
        "workspace-md": "h-9 px-4 text-xs",
        "workspace-lg": "h-10 px-5 text-sm",
        workspace: "h-10 px-4 text-xs",
        "workspace-icon": "h-9 w-9 p-0",
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
