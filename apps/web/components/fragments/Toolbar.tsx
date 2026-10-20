import * as React from "react";
import { cn } from "@/lib/utils";

export interface ToolbarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function Toolbar({ left, right, className, children }: ToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2",
        className
      )}
    >
      {left && <div className="flex items-center gap-2 flex-wrap min-w-0">{left}</div>}
      {children}
      {right && <div className="flex items-center gap-2 shrink-0 flex-wrap">{right}</div>}
    </div>
  );
}
