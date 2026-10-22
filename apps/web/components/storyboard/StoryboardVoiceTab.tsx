"use client";

import React from "react";
import { Volume2, ArrowRight, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStudioStore } from "@/lib/store";
import { api } from "@/lib/api";
import { Project } from "@/types";
import { Button } from "@/components/ui";
import { TTSTab } from "@/components/tts";
import { StoryboardTabHeader } from "./StoryboardTabHeader";

interface StoryboardVoiceTabProps {
  project: Project;
}

function StoryboardTimingSyncCard({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const showToast = useStudioStore((s) => s.showToast);
  const items = project.storyboard_items ?? [];
  const hasTimingSynced = items.some((it) => it.end_time > 0);

  const syncTiming = useMutation({
    mutationFn: () => api.syncStoryboardTiming(project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Timing gambar storyboard berhasil disinkronkan dengan Whisper!", "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal sinkronisasi timing", "error");
    },
  });

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[#456A4E]" />
          <h4 className="text-xs font-semibold text-foreground">
            Status Sinkronisasi Waktu (Whisper Alignment)
          </h4>
        </div>
        <Button
          variant="workspace-secondary"
          size="workspace-sm"
          onClick={() => syncTiming.mutate()}
          disabled={syncTiming.isPending}
          className="gap-1.5 text-[11px]"
        >
          {syncTiming.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          <span>Sinkronkan Ulang</span>
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {hasTimingSynced
          ? `Waktu naskah berhasil disinkronkan. Sebanyak ${items.length} slot ilustrasi gambar telah memiliki durasi detik yang presisi sesuai ucapan narator.`
          : "Klik tombol sinkronkan untuk memetakan timestamp narasi audio ke setiap slot gambar."}
      </p>
    </div>
  );
}

export function StoryboardVoiceTab({ project }: StoryboardVoiceTabProps) {
  const setActiveTab = useStudioStore((s) => s.setActiveTab);
  const hasAudio = !!(project.audio || project.audio_track);

  return (
    <div className="flex w-full flex-col pb-16">
      <StoryboardTabHeader
        icon={Volume2}
        title="Voiceover TTS & Sinkronisasi Narasi"
        badge="Langkah 2 • Suara"
        secondaryBadge="Whisper Alignment"
        description="Pilih provider dan model vokal AI untuk membaca naskah. Whisper memetakan durasi tiap segmen ke gambar."
        actions={
          <>
            <Button
              variant="workspace-secondary"
              size="workspace-sm"
              onClick={() => setActiveTab("storyboard_script")}
              className="text-xs"
            >
              Kembali ke Naskah
            </Button>
            {hasAudio && (
              <Button
                variant="workspace-primary"
                size="workspace-sm"
                onClick={() => setActiveTab("storyboard_images")}
                className="gap-1.5 text-xs"
              >
                <span>Lanjut ke Ilustrasi AI</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        }
      />

      <div className="mx-auto w-full max-w-[1920px] px-4 py-5 sm:px-6">
        <TTSTab
          project={project}
          header={null}
          extra={<StoryboardTimingSyncCard project={project} />}
          nextLabel="Lanjut ke Ilustrasi AI"
          onNavigateNext={() => setActiveTab("storyboard_images")}
        />
      </div>
    </div>
  );
}
