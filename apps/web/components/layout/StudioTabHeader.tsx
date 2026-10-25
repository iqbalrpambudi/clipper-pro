"use client";

import React from "react";
import { Badge } from "@/components/ui";

export interface StudioTabHeaderProps {
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  iconBg?: string;
  title: string;
  badge?: string;
  badgeColor?: string;
  secondaryBadge?: string;
  description: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function StudioTabHeader({
  icon: Icon,
  iconColor = "text-[#A9472C] dark:text-primary",
  iconBg = "bg-[#F8EEEA] border-[#E9C9BD] dark:bg-primary/15 dark:border-primary/30",
  title,
  badge,
  badgeColor = "bg-[#F8EEEA] text-[#A9472C] border-[#E9C9BD] dark:bg-primary/15 dark:text-primary dark:border-primary/30",
  secondaryBadge,
  description,
  actions,
  children,
  className,
}: StudioTabHeaderProps) {
  const rightContent = actions || children;

  return (
    <div
      className={
        className ||
        "w-full shrink-0 border-b border-[#E5E1D7] dark:border-border bg-[#FBFAF7] dark:bg-card"
      }
    >
      <div className="mx-auto flex w-full max-w-[1920px] flex-col justify-between gap-3 px-4 py-3 sm:h-[4.5rem] sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${iconBg} ${iconColor}`}
          >
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="truncate font-serif text-base font-semibold tracking-tight text-[#26251F] dark:text-foreground">
                {title}
              </h1>
              {badge && (
                <Badge
                  variant="outline"
                  className={`shrink-0 text-[10px] font-medium ${badgeColor}`}
                >
                  {badge}
                </Badge>
              )}
              {secondaryBadge && (
                <Badge
                  variant="outline"
                  className="hidden shrink-0 border-[#E5E1D7] dark:border-border font-mono text-[10px] text-[#77766D] dark:text-muted-foreground md:inline-flex"
                >
                  {secondaryBadge}
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-[#77766D] dark:text-muted-foreground sm:line-clamp-none">{description}</p>
          </div>
        </div>

        {rightContent && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
            {rightContent}
          </div>
        )}
      </div>
    </div>
  );
}
