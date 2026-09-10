"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useStudioStore } from "@/lib/store";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

function ToastBanner() {
  const { toast, hideToast } = useStudioStore();
  if (!toast) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md animate-scale-pop">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium ${
          toast.type === "success"
            ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-200"
            : toast.type === "error"
            ? "bg-rose-950/90 border-rose-500/40 text-rose-200"
            : "bg-surface-card/90 border-brand-500/40 text-slate-200"
        } backdrop-blur-lg`}
      >
        {toast.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
        {toast.type === "error" && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />}
        {toast.type === "info" && <Info className="w-5 h-5 text-brand-400 shrink-0" />}
        <span className="flex-1">{toast.message}</span>
        <button
          onClick={hideToast}
          className="p-1 hover:bg-white/10 rounded-lg transition"
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
