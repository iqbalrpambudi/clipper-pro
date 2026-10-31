"use client";

import React, { useMemo } from "react";
import { Volume2, ArrowRight, RefreshCw, Loader2, CheckCircle2, Code2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStudioStore } from "@/lib/store";
import { api } from "@/lib/api";
import type { Project } from "@/types";
import { Button } from "@/components/ui";
import { TTSTab } from "@/components/tts";
import { StudioTabHeader } from "@/components/layout/StudioTabHeader";

interface MotionVoiceTabProps {
  project: Project;
}

function MotionCueSyncCard({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const showToast = useStudioStore((s) => s.showToast);

  const scenes = useMemo(() => project.motion_scenes ?? [], [project.motion_scenes]);
  const totalCues = useMemo(
    () => scenes.reduce((sum, s) => sum + (s.cues?.length || 0), 0),
    [scenes]
  );
  const hasAudio = !!(project.audio || project.audio_track);

  const syncTiming = useMutation({
    mutationFn: () => api.syncMotionTiming(project.id),
    onSuccess: (updatedScenes) => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      queryClient.invalidateQueries({ queryKey: ["motion-scenes", project.id] });
      const cueCount = updatedScenes.reduce((acc, s) => acc + (s.cues?.length || 0), 0);
      showToast(
        `Berhasil memetakan ${cueCount} word-cue Whisper ke frame relatif 30fps di ${updatedScenes.length} adegan!`,
        "success"
      );
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal menyinkronkan frame cue motion", "error");
    },
  });

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <h3 className="text-xs font-semibold text-foreground">
            Word-to-Frame Cue Sync (Whisper 30 FPS)
          </h3>
        </div>
        <Button
          variant="workspace-secondary"
          size="workspace-sm"
          onClick={() => syncTiming.mutate()}
          disabled={syncTiming.isPending || !hasAudio}
          className="gap-1.5 text-xs"
        >
          {syncTiming.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          <span>Sinkronkan Cue Frame</span>
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {hasAudio
          ? `Sebanyak ${totalCues} kata telah dipetakan menjadi nomor frame 30fps presisi di ${scenes.length} adegan. Setiap komponen React/Remotion menggunakan hook useCueFrame() agar kartu, garis SVG, dan angka muncul tepat saat kata diucapkan.`
          : `Saat ini menggunakan ${totalCues} estimasi cue sintetis di ${scenes.length} adegan. Buat audio TTS di bawah agar Whisper otomatis memetakan frame presisi per kata.`}
      </p>
    </div>
  );
}

export function MotionVoiceTab({ project }: MotionVoiceTabProps) {
  const setActiveTab = useStudioStore((s) => s.setActiveTab);

  return (
    <div className="flex w-full flex-col pb-16">
      <StudioTabHeader
        icon={Volume2}
        title="Suara Narasi TTS & Word-Level Frame Cue"
        badge="Langkah 2 • Suara & Cue"
        secondaryBadge="Whisper Frame Sync"
        description="Sintesis voiceover AI lalu petakan setiap kata ke frame 30fps agar koreografi animasi sinkron dengan ketukan ucapan."
        actions={
          <>
            <Button
              variant="workspace-secondary"
              size="workspace-sm"
              onClick={() => setActiveTab("motion_script")}
              className="text-xs"
            >
              Kembali ke Naskah
            </Button>
            <Button
              variant="workspace-primary"
              size="workspace-sm"
              onClick={() => setActiveTab("motion_studio")}
              className="gap-1.5 text-xs"
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>Buka Motion Studio (TSX)</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </>
        }
      />

      <div className="mx-auto w-full max-w-[1920px] px-4 py-5 sm:px-6">
        <TTSTab
          project={project}
          header={null}
          extra={<MotionCueSyncCard project={project} />}
          nextLabel="Buka Motion Studio (TSX)"
          onNavigateNext={() => setActiveTab("motion_studio")}
        />
      </div>
    </div>
  );
}

