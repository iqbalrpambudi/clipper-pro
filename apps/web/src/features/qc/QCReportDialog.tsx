import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Film,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { ProjectDetail, QCConfig, QCRun } from "@/types";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import { QC_DIMENSION_LABELS, QC_PLATFORMS, normalizeQCConfig } from "./constants";

type QCGate = "script" | "timeline";

const GATE_LABELS: Record<QCGate, string> = {
  script: "Narasi & Scene",
  timeline: "Visual & Timeline",
};

interface QCReportDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialGate?: "script" | "timeline";
}

function StatusBadge({ run }: { run: QCRun }) {
  if (run.status === "passed") {
    return (
      <Badge variant="workspace-success" className="gap-1 text-[11px] font-semibold">
        <CheckCircle2 className="h-3 w-3" />
        Lolos QC
      </Badge>
    );
  }
  if (run.status === "fixed") {
    return (
      <Badge variant="workspace-success" className="gap-1 text-[11px] font-semibold">
        <Wrench className="h-3 w-3" />
        Diperbaiki Otomatis ({run.rounds_used}x)
      </Badge>
    );
  }
  if (run.status === "skipped") {
    return (
      <Badge variant="outline" className="gap-1 text-[11px] text-muted-foreground">
        Dilewati (Fail-Open)
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 border-amber-500/40 bg-amber-500/10 text-[11px] font-semibold text-amber-600 dark:text-amber-400"
    >
      <AlertTriangle className="h-3 w-3" />
      Catatan Peringatan
    </Badge>
  );
}

export function QCReportDialog({
  projectId,
  open,
  onOpenChange,
  initialGate = "timeline",
}: QCReportDialogProps) {
  const queryClient = useQueryClient();
  const { showToast, setActiveTab } = useStudioStore();
  const [selectedGate, setSelectedGate] = useState<"script" | "timeline">(initialGate);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.getProject(projectId),
    enabled: Boolean(projectId) && open,
  });

  const { data: defaults } = useQuery({
    queryKey: ["project-defaults"],
    queryFn: api.getProjectDefaults,
    enabled: open,
  });

  const { data: latestQC, isLoading: isLoadingLatest } = useQuery({
    queryKey: ["qc-latest", projectId],
    queryFn: () => api.getLatestQC(projectId),
    enabled: Boolean(projectId) && open,
  });

  const { data: qcRuns = [] } = useQuery({
    queryKey: ["qc-runs", projectId, selectedGate],
    queryFn: () => api.getQCRuns(projectId, selectedGate),
    enabled: Boolean(projectId) && open,
  });

  const effectiveConfig: QCConfig = normalizeQCConfig(project?.qc_config ?? defaults?.qc);

  const updateQCConfigMutation = useMutation({
    mutationFn: (nextConfig: QCConfig) => api.updateProject(projectId, { qc_config: nextConfig }),
    onSuccess: (updated) => {
      queryClient.setQueryData<ProjectDetail>(["project", projectId], (old) =>
        old ? { ...old, qc_config: updated.qc_config } : old
      );
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal menyimpan pengaturan QC", "error");
    },
  });

  // fix=false: review only (report, nothing changes). fix=true: apply fixes, shown as before/after + revert.
  const runQCMutation = useMutation({
    mutationFn: async ({ gates, fix }: { gates: QCGate[]; fix: boolean }) => {
      let last: QCRun | undefined;
      for (const gate of gates) {
        last = await api.runProjectQC(projectId, { gate, auto_fix: fix });
      }
      return last as QCRun;
    },
    onSuccess: (run, { gates }) => {
      queryClient.invalidateQueries({ queryKey: ["qc-latest", projectId] });
      queryClient.invalidateQueries({ queryKey: ["qc-runs", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      if (gates.length > 1) {
        showToast("Cek QC narasi & visual selesai", "success");
        return;
      }
      showToast(
        run.summary ||
          `QC ${GATE_LABELS[run.gate as QCGate]} selesai (skor ${run.overall_score.toFixed(1)})`,
        run.passed ? "success" : "info"
      );
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal menjalankan AI QC", "error");
    },
  });

  const revertMutation = useMutation({
    mutationFn: (runId: string) => api.revertQCRun(projectId, runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qc-latest", projectId] });
      queryClient.invalidateQueries({ queryKey: ["qc-runs", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      showToast("Perubahan auto-fix dikembalikan ke versi sebelum QC", "info");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal mengembalikan perubahan QC", "error");
    },
  });

  const patchConfig = (patch: Partial<QCConfig>) => {
    const next = normalizeQCConfig({ ...effectiveConfig, ...patch });
    updateQCConfigMutation.mutate(next);
  };

  const activeRun = selectedGate === "script" ? latestQC?.script : latestQC?.timeline;
  const canFix = Boolean(
    activeRun &&
    !activeRun.passed &&
    activeRun.issues.some(
      (i) => i.auto_fixable && (i.severity === "major" || i.severity === "blocker")
    )
  );
  const pendingFix = runQCMutation.isPending && runQCMutation.variables?.fix;
  const pendingAll = runQCMutation.isPending && (runQCMutation.variables?.gates.length ?? 0) > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="workspace-dialog max-w-2xl max-h-[88vh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="border-b border-border bg-card px-5 py-4 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <DialogTitle className="text-sm font-semibold">
                AI Quality Control (Siap FYP)
              </DialogTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runQCMutation.mutate({ gates: ["script", "timeline"], fix: false })}
              disabled={runQCMutation.isPending}
              className="h-8 gap-1.5 text-xs font-semibold"
            >
              {pendingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              )}
              Cek Semua
            </Button>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Reviewer AI untuk narasi, pemilihan scene, dan visual. Hanya jalan saat kamu klik.{" "}
            <strong>Cek</strong> = laporan saja, tidak mengubah apa pun. <strong>Perbaiki</strong> =
            terapkan perbaikan, tiap perubahan terlihat &amp; bisa dikembalikan.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto divide-y divide-border px-5 py-4 space-y-4">
          {/* Quick Project QC Settings */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Target:</span>
                {QC_PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => patchConfig({ platform: p.id })}
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[11px] font-medium transition",
                      effectiveConfig.platform === p.id
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Ambang lolos:</span>
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  {effectiveConfig.threshold.toFixed(1)} / 10
                </span>
              </div>
            </div>
          </div>

          {/* Gate Selector + Manual Trigger */}
          <div className="pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-lg bg-muted/60 p-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedGate("script")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
                    selectedGate === "script"
                      ? "bg-card text-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  <span>{GATE_LABELS.script}</span>
                  {latestQC?.script && (
                    <span className="rounded bg-primary/15 px-1.5 py-0 font-mono text-[11px] tabular-nums text-primary">
                      {latestQC.script.overall_score.toFixed(1)}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedGate("timeline")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
                    selectedGate === "timeline"
                      ? "bg-card text-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Film className="h-3.5 w-3.5 text-primary" />
                  <span>{GATE_LABELS.timeline}</span>
                  {latestQC?.timeline && (
                    <span className="rounded bg-primary/15 px-1.5 py-0 font-mono text-[11px] tabular-nums text-primary">
                      {latestQC.timeline.overall_score.toFixed(1)}
                    </span>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                {canFix && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runQCMutation.mutate({ gates: [selectedGate], fix: true })}
                    disabled={runQCMutation.isPending}
                    className="h-8 gap-1.5 text-xs font-semibold"
                    title="Terapkan perbaikan untuk catatan major; hasilnya bisa dikembalikan"
                  >
                    {pendingFix ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wrench className="h-3.5 w-3.5 text-primary" />
                    )}
                    Perbaiki
                  </Button>
                )}
                <Button
                  variant="workspace-primary"
                  size="sm"
                  onClick={() => runQCMutation.mutate({ gates: [selectedGate], fix: false })}
                  disabled={runQCMutation.isPending}
                  className="h-8 gap-1.5 text-xs font-semibold"
                >
                  {runQCMutation.isPending && !pendingFix && !pendingAll ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Cek {GATE_LABELS[selectedGate]}
                </Button>
              </div>
            </div>

            {/* Active Gate Report Body */}
            {isLoadingLatest ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Memuat laporan QC...
              </div>
            ) : !activeRun ? (
              <div className="rounded-xl border border-border bg-secondary/20 p-6 text-center text-xs text-muted-foreground">
                Belum ada pemeriksaan <strong>{GATE_LABELS[selectedGate]}</strong>. Klik{" "}
                <strong>Cek {GATE_LABELS[selectedGate]}</strong> di atas untuk melihat laporan.
              </div>
            ) : (
              <div className="space-y-4 rounded-xl border border-border bg-card p-4">
                {/* Summary Header */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-12 items-center justify-center rounded-lg bg-primary/10 font-mono text-sm font-bold tabular-nums text-primary">
                      {activeRun.overall_score.toFixed(1)}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge run={activeRun} />
                        <span className="font-mono text-[11px] text-muted-foreground">
                          Ambang {activeRun.threshold.toFixed(1)}
                        </span>
                      </div>
                      {activeRun.summary && (
                        <p className="mt-0.5 text-xs text-foreground/90">{activeRun.summary}</p>
                      )}
                    </div>
                  </div>

                  {activeRun.can_revert && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => revertMutation.mutate(activeRun.id)}
                      disabled={revertMutation.isPending}
                      className="h-7 gap-1 border-border text-xs"
                      title="Kembalikan naskah/timeline ke versi sebelum auto-fix"
                    >
                      {revertMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3 text-primary" />
                      )}
                      Kembalikan Sebelum Fix
                    </Button>
                  )}
                </div>

                {/* Dimension Scores */}
                {Object.keys(activeRun.dimension_scores || {}).length > 0 && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
                    {Object.entries(activeRun.dimension_scores).map(([dim, score]) => (
                      <div
                        key={dim}
                        className="rounded-lg border border-border bg-background px-3 py-2 space-y-1"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">
                            {QC_DIMENSION_LABELS[dim] || dim}
                          </span>
                          <span className="font-mono font-semibold tabular-nums text-primary">
                            {Number(score).toFixed(1)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.min(100, Math.max(10, Number(score) * 10))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Applied Auto-Fixes */}
                {activeRun.applied_fixes.length > 0 && (
                  <div className="space-y-1.5 border-t border-border pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Wrench className="h-3.5 w-3.5 text-primary" />
                        Perbaikan Otomatis ({activeRun.applied_fixes.length})
                      </span>
                      {activeRun.reverted && (
                        <Badge variant="outline" className="text-[10px]">
                          Telah Dikembalikan
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {activeRun.applied_fixes.map((fix, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-foreground">{fix.target}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              Putaran #{fix.round}
                            </span>
                          </div>
                          <p className="text-muted-foreground">{fix.summary}</p>
                          {typeof fix.before === "string" && typeof fix.after === "string" && (
                            <div className="grid grid-cols-1 gap-1 pt-1 font-mono text-[11px]">
                              <div className="truncate text-muted-foreground line-through">
                                - {fix.before}
                              </div>
                              <div className="truncate text-primary">+ {fix.after}</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Issues List */}
                {activeRun.issues.length > 0 ? (
                  <div className="space-y-1.5 border-t border-border pt-3">
                    <span className="text-xs font-semibold text-foreground">
                      Catatan Pemeriksaan ({activeRun.issues.length})
                    </span>
                    <div className="space-y-1.5">
                      {activeRun.issues.map((issue) => (
                        <div
                          key={issue.id}
                          className="flex items-start justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge
                                variant={
                                  issue.severity === "blocker" || issue.severity === "major"
                                    ? "destructive"
                                    : "outline"
                                }
                                className="text-[10px] uppercase"
                              >
                                {issue.severity}
                              </Badge>
                              <span className="font-medium text-foreground">
                                {QC_DIMENSION_LABELS[issue.dimension] || issue.dimension}
                              </span>
                            </div>
                            <p className="text-muted-foreground">{issue.message}</p>
                          </div>

                          {(issue.timestamp_sec !== null && issue.timestamp_sec !== undefined) ||
                          (issue.segment_index !== null && issue.segment_index !== undefined) ? (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => {
                                setActiveTab(selectedGate === "script" ? "narration" : "timeline");
                                onOpenChange(false);
                              }}
                              className="h-6 shrink-0 gap-1 px-2 font-mono text-[11px] text-primary"
                            >
                              <Play className="h-2.5 w-2.5" />
                              {issue.timestamp_sec !== null && issue.timestamp_sec !== undefined
                                ? `${issue.timestamp_sec.toFixed(1)}s`
                                : `Seg #${(issue.segment_index ?? 0) + 1}`}
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                    Tidak ada kekurangan yang perlu diperbaiki pada tahap ini.
                  </p>
                )}

                {/* Recent Runs History */}
                {qcRuns.length > 1 && (
                  <div className="border-t border-border pt-3 space-y-1.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Riwayat Pemeriksaan ({qcRuns.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {qcRuns.slice(0, 5).map((r) => (
                        <span
                          key={r.id}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground"
                        >
                          <strong className="text-foreground">{r.overall_score.toFixed(1)}</strong>
                          <span>·</span>
                          <span>{r.status}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
