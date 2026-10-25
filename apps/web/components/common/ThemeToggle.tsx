"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Button,
} from "@/components/ui";

export function ThemeToggle({
  className,
  align = "end",
}: {
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        variant="workspace-secondary"
        size="workspace-icon"
        className={`h-9 w-9 shrink-0 ${className || ""}`}
        aria-label="Ganti tema tampilan"
        title="Ganti tema tampilan"
      >
        <Sun className="h-4 w-4 opacity-50" />
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="workspace-secondary"
          size="workspace-icon"
          className={`relative h-9 w-9 shrink-0 transition-colors ${className || ""}`}
          aria-label="Ganti tema tampilan (Terang / Gelap / Sistem)"
          title={`Tema saat ini: ${
            theme === "system"
              ? `Sistem (${isDark ? "Gelap" : "Terang"})`
              : theme === "dark"
                ? "Gelap"
                : "Terang"
          }`}
        >
          {isDark ? (
            <Moon className="h-4 w-4 text-[#E07A5F] transition-transform duration-200 rotate-0" />
          ) : (
            <Sun className="h-4 w-4 text-[#C45B3A] transition-transform duration-200 rotate-0" />
          )}
          <span className="sr-only">Ganti tema</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} appearance="workspace" className="min-w-[150px]">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className="flex items-center justify-between gap-2 cursor-pointer text-xs"
        >
          <span className="flex items-center gap-2">
            <Sun className="h-3.5 w-3.5 text-[#C45B3A]" />
            <span>Terang (Claude Light)</span>
          </span>
          {theme === "light" && <Check className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className="flex items-center justify-between gap-2 cursor-pointer text-xs"
        >
          <span className="flex items-center gap-2">
            <Moon className="h-3.5 w-3.5 text-[#E07A5F]" />
            <span>Gelap (Claude Dark)</span>
          </span>
          {theme === "dark" && <Check className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className="flex items-center justify-between gap-2 cursor-pointer text-xs"
        >
          <span className="flex items-center gap-2">
            <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Sesuai Sistem</span>
          </span>
          {theme === "system" && <Check className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeSegmented({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const options = [
    { id: "light", label: "Terang", icon: Sun },
    { id: "dark", label: "Gelap", icon: Moon },
    { id: "system", label: "Sistem", icon: Monitor },
  ] as const;

  return (
    <div
      className={`inline-flex items-center rounded-xl border border-border bg-card p-1 shadow-sm ${
        className || ""
      }`}
      role="radiogroup"
      aria-label="Pilihan tema tampilan"
    >
      {options.map(({ id, label, icon: Icon }) => {
        const isActive = mounted ? theme === id : id === "light";
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => setTheme(id)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
              isActive
                ? "bg-primary/15 text-primary shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
