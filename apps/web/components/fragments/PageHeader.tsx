import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  icon,
  badges,
  actions,
  className,
  children,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 pb-4 border-b border-[#2E2E2E]",
        className
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            {icon && <div className="shrink-0">{icon}</div>}
            <h1 className="text-lg font-bold text-white tracking-tight">
              {title}
            </h1>
            {badges && <div className="flex items-center gap-1.5">{badges}</div>}
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>

      {children}
    </div>
  );
}
