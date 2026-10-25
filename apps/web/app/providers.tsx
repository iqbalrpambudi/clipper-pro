"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { useStudioStore } from "@/lib/store";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

function ToastBanner() {
  const { toast, hideToast } = useStudioStore();
  if (!toast) return null;

  return (
    <div className="fixed top-6 right-6 z-[9999] max-w-md w-full sm:w-auto animate-scale-pop pointer-events-auto">
      <div
        className={`flex items-start gap-3 px-4 py-3.5 rounded-2xl shadow-2xl border text-xs sm:text-sm font-medium ${
          toast.type === "success"
            ? "bg-emerald-50/95 border-emerald-400/50 text-emerald-900 shadow-emerald-200/30 dark:bg-emerald-950/95 dark:border-emerald-700/50 dark:text-emerald-200 dark:shadow-black/40"
            : toast.type === "error"
              ? "bg-rose-50/95 border-rose-400/50 text-rose-900 shadow-rose-200/30 dark:bg-rose-950/95 dark:border-rose-700/50 dark:text-rose-200 dark:shadow-black/40"
              : "bg-card/95 border-border text-foreground shadow-black/20"
        } backdrop-blur-xl transition-all`}
      >
        {toast.type === "success" && (
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        )}
        {toast.type === "error" && (
          <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
        )}
        {toast.type === "info" && (
          <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        )}
        <div className="flex-1 max-h-60 overflow-y-auto pr-1 break-words leading-relaxed">
          {toast.message}
        </div>
        <button
          onClick={hideToast}
          aria-label="Tutup notifikasi"
          className="p-1 hover:bg-foreground/10 rounded-lg transition text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 5000,
          },
        },
      })
  );

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <ToastBanner />
      </QueryClientProvider>
    </NextThemesProvider>
  );
}

