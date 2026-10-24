"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  FilterPills — standardised pill-tab container + items              */
/*  Matches `.workspace-filter-pills` / `.workspace-filter-active`     */
/*  from globals.css so every tab strip looks identical.                */
/* ------------------------------------------------------------------ */

export interface FilterPillItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Badge / count shown after the label */
  badge?: React.ReactNode;
}

interface FilterPillsProps<T extends string = string> {
  items: FilterPillItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

function FilterPillsInner<T extends string>(
  { items, value, onChange, className }: FilterPillsProps<T>,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "workspace-filter-pills flex items-center gap-1.5 overflow-x-auto",
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            aria-pressed={isActive}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
              isActive
                ? "workspace-filter-active"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            <span>{item.label}</span>
            {item.badge != null && (
              <span className="rounded-full bg-black/8 px-1.5 py-px font-mono text-[10px]">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export const FilterPills = React.forwardRef(FilterPillsInner) as <
  T extends string = string,
>(
  props: FilterPillsProps<T> & { ref?: React.ForwardedRef<HTMLDivElement> },
) => React.ReactElement;
