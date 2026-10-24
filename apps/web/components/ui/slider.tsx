import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

type SliderProps = React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
  appearance?: "default" | "workspace";
};

const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, SliderProps>(
  ({ appearance = "default", className, "aria-label": ariaLabel, ...props }, ref) => (
    <SliderPrimitive.Root
      ref={ref}
      className={cn("relative flex w-full touch-none select-none items-center", className)}
      {...props}
    >
      <SliderPrimitive.Track
        className={cn(
          "relative h-1.5 w-full grow overflow-hidden rounded-full",
          appearance === "workspace" ? "bg-[#E5E1D7]" : "bg-muted"
        )}
      >
        <SliderPrimitive.Range
          className={cn(
            "absolute h-full",
            appearance === "workspace" ? "bg-[#C45B3A]" : "bg-primary"
          )}
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={ariaLabel}
        className={cn(
          "block h-4 w-4 cursor-grab rounded-full shadow transition-transform hover:scale-110 active:cursor-grabbing disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2",
          appearance === "workspace"
            ? "border border-[#C45B3A] bg-[#FBFAF7] focus-visible:ring-[#C45B3A]/50"
            : "border border-primary/50 bg-white focus-visible:ring-ring"
        )}
      />
    </SliderPrimitive.Root>
  )
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
