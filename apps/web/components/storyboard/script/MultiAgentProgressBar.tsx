"use client";

import React from "react";
import {
  PenTool,
  UserCheck,
  Clapperboard,
  CheckCircle2,
  Loader2,
  Sparkles,
  Clock,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TaskEvent, useStudioStore } from "@/lib/store";
import { api } from "@/lib/api";

interface MultiAgentProgressBarProps {
  activeTask?: TaskEvent | null;
  isGenerating?: boolean;
  targetDurationMins?: number;
  className?: string;
}

export function MultiAgentProgressBar({
  activeTask,
  isGenerating,
  targetDurationMins = 5,
  className,
}: MultiAgentProgressBarProps) {
  const isStoryboardTask =
    activeTask?.task_type === "storyboard_generate" &&
    (activeTask?.status === "progress" || activeTask?.status === "queued");

  if (!isGenerating && !isStoryboardTask) {
    return null;
  }

  const overallProgress = Math.max(
    0,
    Math.min(100, typeof activeTask?.progress === "number" ? activeTask.progress : 5)
  );
  const currentStage = activeTask?.stage || "scriptwriter";
  const agentKey =
    (activeTask?.data?.agent as string) ||
    (overallProgress < 45 ? "scriptwriter" : overallProgress < 68 ? "character_designer" : "director");

  const agentLocalProgress =
    typeof activeTask?.data?.agent_progress === "number"
      ? activeTask.data.agent_progress
      : 0;

  // Agent 1: Scriptwriter
  const isAgent1Done =
    overallProgress >= 45 ||
    currentStage === "character_designer" ||
    currentStage === "director" ||
    currentStage === "completed";
  const isAgent1Active =
    !isAgent1Done &&
    (agentKey === "scriptwriter" || currentStage === "scriptwriter" || overallProgress < 45);
  const agent1Progress = isAgent1Done
    ? 100
    : isAgent1Active
    ? Math.max(10, agentLocalProgress || Math.round((overallProgress / 45) * 100))
    : 0;

  // Agent 2: Character & World Agent
  const isAgent2Done =
    overallProgress >= 68 || currentStage === "director" || currentStage === "completed";
  const isAgent2Active =
    !isAgent2Done &&
    (agentKey === "character_designer" ||
      currentStage === "character_designer" ||
      (overallProgress >= 45 && overallProgress < 68));
  const agent2Progress = isAgent2Done
    ? 100
    : isAgent2Active
    ? Math.max(10, agentLocalProgress || Math.round(((overallProgress - 45) / 23) * 100))
    : 0;

  // Agent 3: Director Agent
  const isAgent3Done = overallProgress >= 100 || currentStage === "completed";
  const isAgent3Active =
    !isAgent3Done &&
    (agentKey === "director" ||
      currentStage === "director" ||
      overallProgress >= 68);
  const agent3Progress = isAgent3Done
    ? 100
    : isAgent3Active
    ? Math.max(10, agentLocalProgress || Math.round(((overallProgress - 68) / 32) * 100))
    : 0;

  const currentMessage =
    activeTask?.message ||
    (isAgent1Active
      ? `Scriptwriter Agent: Menulis naskah narasi (${targetDurationMins} menit)...`
      : isAgent2Active
      ? "Character & World Agent: Mengunci profil visual tokoh & lokasi..."
      : isAgent3Active
      ? "Director Agent: Merancang sudut kamera & adegan 16:9..."
      : "Memproses generasi naskah & visual storyboard...");

  const dataPayload = activeTask?.data as Record<string, unknown> | undefined;

  return (
    <div
      className={cn(
        "rounded-2xl border border-[#E9C9BD] bg-gradient-to-b from-[#FFFDFB] via-[#FBFAF7] to-[#F8EEEA]/50 p-4 shadow-sm transition-all animate-in fade-in-50 duration-300 dark:border-border dark:from-card dark:to-card/80",
        className
      )}
    >
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5E1D7]/70 dark:border-border pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#C45B3A] text-white shadow-sm">
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#A9472C] dark:text-[#E2835E]">
                Storyboard Multi-Agent System
              </h4>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#F8EEEA] dark:bg-muted px-2 py-0.5 text-[10px] font-medium text-[#C45B3A] dark:text-foreground">
                <Clock className="w-2.5 h-2.5" />
                Target {targetDurationMins} Mnt
              </span>
            </div>
            <p className="line-clamp-1 text-xs text-[#555248] dark:text-muted-foreground font-medium mt-0.5">
              {currentMessage}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="font-mono text-sm font-bold text-[#A9472C] dark:text-[#E2835E]">
            {overallProgress}%
          </span>
          <button
            type="button"
            onClick={async () => {
              if (activeTask?.project_id) {
                try {
                  await api.cancelProjectTasks(activeTask.project_id);
                } catch {}
                useStudioStore.getState().setActiveTask(null, activeTask.project_id);
              } else {
                useStudioStore.getState().setActiveTask(null);
              }
            }}
            title="Reset / Batalkan proses"
            className="flex h-6 w-6 items-center justify-center rounded-md border border-[#E5E1D7] text-[#77766D] hover:bg-[#F8EEEA] hover:text-[#A9472C] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Global Progress Bar */}
      <div className="mt-3 relative h-2 w-full overflow-hidden rounded-full bg-[#E5E1D7]/60 dark:bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#C45B3A] via-[#E2835E] to-[#76816B] transition-all duration-500 ease-out"
          style={{ width: `${Math.max(4, overallProgress)}%` }}
        />
      </div>

      {/* 3 Specialized Agents Cards */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {/* Agent 1: Scriptwriter */}
        <div
          className={cn(
            "relative flex flex-col justify-between rounded-xl border p-3 transition-all",
            isAgent1Active
              ? "border-[#C45B3A] bg-white dark:bg-card shadow-sm ring-1 ring-[#C45B3A]/30"
              : isAgent1Done
              ? "border-[#C9DDCF] bg-[#ECF3EB]/40 dark:bg-[#ECF3EB]/10"
              : "border-[#E5E1D7]/70 bg-[#FBFAF7]/50 dark:bg-muted/30 opacity-75"
          )}
        >
          <div>
            <div className="flex items-center justify-between gap-1.5 mb-1.5">
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs",
                    isAgent1Active
                      ? "bg-[#F8EEEA] text-[#C45B3A] font-bold"
                      : isAgent1Done
                      ? "bg-[#ECF3EB] text-[#456A4E]"
                      : "bg-[#E5E1D7]/50 text-[#77766D]"
                  )}
                >
                  <PenTool className="h-3 w-3" />
                </div>
                <span className="text-[11px] font-semibold text-[#26251F] dark:text-foreground">
                  1. Scriptwriter Agent
                </span>
              </div>

              {isAgent1Done ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-[#ECF3EB] dark:bg-[#456A4E]/20 px-1.5 py-0.5 text-[9px] font-semibold text-[#456A4E]">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Selesai
                </span>
              ) : isAgent1Active ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#F8EEEA] dark:bg-primary/20 px-1.5 py-0.5 text-[9px] font-semibold text-[#C45B3A]">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" /> {agent1Progress}%
                </span>
              ) : (
                <span className="text-[9px] text-[#77766D]">Menunggu</span>
              )}
            </div>

            <p className="text-[10px] text-[#77766D] dark:text-muted-foreground line-clamp-2">
              Menulis alur cerita mendalam & naskah beat murni (18–25 kata/beat).
            </p>
          </div>

          <div className="mt-2.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E5E1D7]/50 dark:bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  isAgent1Done ? "bg-[#456A4E]" : "bg-[#C45B3A]"
                )}
                style={{ width: `${agent1Progress}%` }}
              />
            </div>

            {typeof dataPayload?.word_count === "number" && (
              <span className="mt-1 block text-[9px] font-mono text-[#456A4E]">
                ✓ {dataPayload.word_count} kata naskah
              </span>
            )}
          </div>
        </div>

        {/* Agent 2: Character & World Designer */}
        <div
          className={cn(
            "relative flex flex-col justify-between rounded-xl border p-3 transition-all",
            isAgent2Active
              ? "border-[#76816B] bg-white dark:bg-card shadow-sm ring-1 ring-[#76816B]/30"
              : isAgent2Done
              ? "border-[#C9DDCF] bg-[#ECF3EB]/40 dark:bg-[#ECF3EB]/10"
              : "border-[#E5E1D7]/70 bg-[#FBFAF7]/50 dark:bg-muted/30 opacity-75"
          )}
        >
          <div>
            <div className="flex items-center justify-between gap-1.5 mb-1.5">
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs",
                    isAgent2Active
                      ? "bg-[#ECF3EB] text-[#456A4E] font-bold"
                      : isAgent2Done
                      ? "bg-[#ECF3EB] text-[#456A4E]"
                      : "bg-[#E5E1D7]/50 text-[#77766D]"
                  )}
                >
                  <UserCheck className="h-3 w-3" />
                </div>
                <span className="text-[11px] font-semibold text-[#26251F] dark:text-foreground">
                  2. Character & World
                </span>
              </div>

              {isAgent2Done ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-[#ECF3EB] dark:bg-[#456A4E]/20 px-1.5 py-0.5 text-[9px] font-semibold text-[#456A4E]">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Selesai
                </span>
              ) : isAgent2Active ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#ECF3EB] dark:bg-[#456A4E]/20 px-1.5 py-0.5 text-[9px] font-semibold text-[#456A4E]">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" /> {agent2Progress}%
                </span>
              ) : (
                <span className="text-[9px] text-[#77766D]">Menunggu</span>
              )}
            </div>

            <p className="text-[10px] text-[#77766D] dark:text-muted-foreground line-clamp-2">
              Mengunci profil tokoh (close-up & wide), micro-set lokasi & arah cahaya.
            </p>
          </div>

          <div className="mt-2.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E5E1D7]/50 dark:bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  isAgent2Done ? "bg-[#456A4E]" : "bg-[#76816B]"
                )}
                style={{ width: `${agent2Progress}%` }}
              />
            </div>

            {typeof dataPayload?.characters_count === "number" && (
              <span className="mt-1 block text-[9px] font-mono text-[#456A4E]">
                ✓ {String(dataPayload.characters_count)} Tokoh & {String(dataPayload.locations_count || 0)} Lokasi
              </span>
            )}
          </div>
        </div>

        {/* Agent 3: Director Agent */}
        <div
          className={cn(
            "relative flex flex-col justify-between rounded-xl border p-3 transition-all",
            isAgent3Active
              ? "border-[#41627F] bg-white dark:bg-card shadow-sm ring-1 ring-[#41627F]/30"
              : isAgent3Done
              ? "border-[#C9DDCF] bg-[#ECF3EB]/40 dark:bg-[#ECF3EB]/10"
              : "border-[#E5E1D7]/70 bg-[#FBFAF7]/50 dark:bg-muted/30 opacity-75"
          )}
        >
          <div>
            <div className="flex items-center justify-between gap-1.5 mb-1.5">
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs",
                    isAgent3Active
                      ? "bg-[#EAF0F5] text-[#41627F] font-bold"
                      : isAgent3Done
                      ? "bg-[#ECF3EB] text-[#456A4E]"
                      : "bg-[#E5E1D7]/50 text-[#77766D]"
                  )}
                >
                  <Clapperboard className="h-3 w-3" />
                </div>
                <span className="text-[11px] font-semibold text-[#26251F] dark:text-foreground">
                  3. Director Agent
                </span>
              </div>

              {isAgent3Done ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-[#ECF3EB] dark:bg-[#456A4E]/20 px-1.5 py-0.5 text-[9px] font-semibold text-[#456A4E]">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Selesai
                </span>
              ) : isAgent3Active ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF0F5] dark:bg-[#41627F]/20 px-1.5 py-0.5 text-[9px] font-semibold text-[#41627F]">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" /> {agent3Progress}%
                </span>
              ) : (
                <span className="text-[9px] text-[#77766D]">Menunggu</span>
              )}
            </div>

            <p className="text-[10px] text-[#77766D] dark:text-muted-foreground line-clamp-2">
              Menyusun sudut kamera, 180° blocking, gerakan shot & prompt visual 16:9.
            </p>
          </div>

          <div className="mt-2.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E5E1D7]/50 dark:bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  isAgent3Done ? "bg-[#456A4E]" : "bg-[#41627F]"
                )}
                style={{ width: `${agent3Progress}%` }}
              />
            </div>

            {typeof dataPayload?.completed_chapters === "number" && (
              <span className="mt-1 block text-[9px] font-mono text-[#41627F]">
                Babak {String(dataPayload.completed_chapters)}/{String(dataPayload.total_chapters || 0)} diarahkan
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
