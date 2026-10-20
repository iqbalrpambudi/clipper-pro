"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
            ? "bg-emerald-950/95 border-emerald-500/50 text-emerald-100 shadow-emerald-950/50"
            : toast.type === "error"
              ? "bg-rose-950/95 border-rose-500/50 text-rose-100 shadow-rose-950/50"
              : "bg-[#18181B]/95 border-violet-500/50 text-slate-100 shadow-violet-950/50"
        } backdrop-blur-xl transition-all`}
      >
        {toast.type === "success" && (
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        )}
        {toast.type === "error" && (
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        )}
        {toast.type === "info" && <Info className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />}
        <div className="flex-1 max-h-60 overflow-y-auto pr-1 break-words leading-relaxed">
          {toast.message}
        </div>
        <button
          onClick={hideToast}
          aria-label="Tutup notifikasi"
          className="p-1 hover:bg-white/10 rounded-lg transition text-slate-400 hover:text-white shrink-0 mt-0.5"
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
    <QueryClientProvider client={queryClient}>
      {children}
      <ToastBanner />
    </QueryClientProvider>
  );
}
