"use client";

import React from "react";
import { Badge } from "@/components/ui";

export interface StoryboardTabHeaderProps {
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

export function StoryboardTabHeader({
  icon: Icon,
  iconColor = "text-violet-400",
  iconBg = "bg-violet-600/10 border-violet-500/20",
  title,
  badge,
  badgeColor = "bg-violet-500/10 text-violet-300 border-violet-500/30",
  secondaryBadge,
  description,
  actions,
  children,
  className,
}: StoryboardTabHeaderProps) {
  const rightContent = actions || children;

  return (
    <div
      className={
        className ||
        "border-b border-[#222222] bg-[#141414]/95 backdrop-blur-md shrink-0 w-full"
      }
    >
      <div className="max-w-[1920px] w-full mx-auto px-4 sm:px-6 py-2.5 sm:h-14 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}
          >
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm font-bold text-white tracking-tight truncate">
                {title}
              </h1>
              {badge && (
                <Badge
                  variant="outline"
                  className={`text-[10px] font-medium shrink-0 ${badgeColor}`}
                >
                  {badge}
                </Badge>
              )}
              {secondaryBadge && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-[#2E2E2E] text-slate-400 font-mono hidden md:inline-flex shrink-0"
                >
                  {secondaryBadge}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate sm:line-clamp-none">
              {description}
            </p>
          </div>
        </div>

        {rightContent && (
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
            {rightContent}
          </div>
        )}
      </div>
    </div>
  );
}
