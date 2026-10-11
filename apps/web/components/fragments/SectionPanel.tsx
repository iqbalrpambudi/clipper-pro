import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionPanelProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  headerClassName?: string;
}

export function SectionPanel({
  title,
  description,
  icon,
  badge,
  actions,
  children,
  footer,
  className,
  headerClassName,
}: SectionPanelProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[#2E2E2E] bg-[#181818] overflow-hidden shadow-sm transition-all",
        className
      )}
    >
      {(title || actions) && (
        <div
          className={cn(
            "px-4 py-3 border-b border-[#2E2E2E] flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#1C1C1C]/40",
            headerClassName
          )}
        >
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              {icon && <div className="shrink-0">{icon}</div>}
              <h3 className="text-xs font-semibold text-foreground tracking-tight">
                {title}
              </h3>
              {badge && <div>{badge}</div>}
            </div>
            {description && (
              <p className="text-[11px] text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-1.5 shrink-0">{actions}</div>
          )}
        </div>
      )}

      <div className="p-4">{children}</div>

      {footer && (
        <div className="px-4 py-2.5 bg-[#141414] border-t border-[#2E2E2E] flex items-center justify-between text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}
