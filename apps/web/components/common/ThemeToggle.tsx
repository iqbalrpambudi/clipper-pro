"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui";

export function ThemeToggle({
  className,
  align: _align,
}: {
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        type="button"
        variant="workspace-secondary"
        size="workspace-icon"
        className={`h-9 w-9 shrink-0 ${className || ""}`}
        aria-label="Ganti mode tampilan"
        title="Ganti mode tampilan"
        disabled
      >
        <Sun className="h-4 w-4 opacity-50" />
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="workspace-secondary"
      size="workspace-icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`relative h-9 w-9 shrink-0 transition-all active:scale-95 ${className || ""}`}
      aria-label={isDark ? "Beralih ke mode terang" : "Beralih ke mode gelap"}
      title={isDark ? "Beralih ke mode terang" : "Beralih ke mode gelap"}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-amber-400 transition-transform duration-300 hover:rotate-45" />
      ) : (
        <Moon className="h-4 w-4 text-primary transition-transform duration-300 hover:-rotate-12" />
      )}
      <span className="sr-only">
        {isDark ? "Beralih ke mode terang" : "Beralih ke mode gelap"}
      </span>
    </Button>
  );
}
