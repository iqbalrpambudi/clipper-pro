"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStudioStore, TaskEvent } from "@/lib/store";

export function useProjectEvents(projectId: string) {
  const queryClient = useQueryClient();
  const { setActiveTask, showToast } = useStudioStore();
  const clearTimerRef = useRef<NodeJS.Timeout | null>(null);
  const watchdogTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstConnectRef = useRef(true);

  useEffect(() => {
    if (!projectId) return;

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
    const streamUrl = `${baseUrl}/api/v1/projects/${projectId}/events`;
    const eventSource = new EventSource(streamUrl);

    // Watchdog reset helper
    const resetWatchdog = () => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      // If task is active, check DB state silently if no events arrive within 45s
      watchdogTimerRef.current = setTimeout(() => {
        const currentTask = useStudioStore.getState().activeTask;
        if (currentTask && (currentTask.status === "progress" || currentTask.status === "queued")) {
          queryClient.invalidateQueries({ queryKey: ["project", projectId] });
          queryClient.invalidateQueries({ queryKey: ["render-jobs", projectId] });
        }
      }, 45000);
    };

    eventSource.onopen = () => {
      console.log(`[SSE] Connected to project events stream (${projectId})`);
      // If this is a reconnection (not initial mount), sync queries once
      if (!isFirstConnectRef.current) {
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
        queryClient.invalidateQueries({ queryKey: ["render-jobs", projectId] });
      }
      isFirstConnectRef.current = false;
    };

    eventSource.onmessage = (event) => {
      try {
        if (!event.data) return;
        const payload: TaskEvent | { type: string; project_id: string } = JSON.parse(event.data);

        // Initial handshake message
        if ("type" in payload && payload.type === "connected") {
          return;
        }

        const task = payload as TaskEvent;
        if (!task.task_type) return;

        resetWatchdog();

        if (clearTimerRef.current) {
          clearTimeout(clearTimerRef.current);
          clearTimerRef.current = null;
        }

        setActiveTask(task, projectId);

        // Auto-refresh queries for real-time sync during render or tasks
        if (task.task_type === "render") {
          queryClient.invalidateQueries({ queryKey: ["render-jobs", projectId] });
        }

        if (task.status === "success") {
          if (watchdogTimerRef.current) {
            clearTimeout(watchdogTimerRef.current);
            watchdogTimerRef.current = null;
          }

          showToast(task.message || "Proses berhasil diselesaikan!", "success");
          // refetchType "all" makes invalidate also refetch active + inactive queries
          queryClient.invalidateQueries({ queryKey: ["project", projectId], refetchType: "all" });
          queryClient.invalidateQueries({
            queryKey: ["render-jobs", projectId],
            refetchType: "all",
          });
          queryClient.invalidateQueries({ queryKey: ["scenes", projectId], refetchType: "all" });

          // Retain success status briefly, then auto-dismiss
          clearTimerRef.current = setTimeout(() => {
            setActiveTask(null, projectId);
          }, 3500);
        } else if (task.status === "error") {
          if (watchdogTimerRef.current) {
            clearTimeout(watchdogTimerRef.current);
            watchdogTimerRef.current = null;
          }

          const isCancelled = task.stage === "cancelled" || task.error === "Dibatalkan";
          if (isCancelled) {
            showToast(task.message || "Proses worker berhasil dibatalkan", "info");
          } else {
            showToast(
              task.error || task.message || "Terjadi kesalahan pada worker background",
              "error"
            );
          }
          queryClient.invalidateQueries({ queryKey: ["project", projectId], refetchType: "all" });
          queryClient.invalidateQueries({
            queryKey: ["render-jobs", projectId],
            refetchType: "all",
          });
          queryClient.invalidateQueries({ queryKey: ["scenes", projectId], refetchType: "all" });

          // Keep cancelled toast brief, error visible longer
          clearTimerRef.current = setTimeout(
            () => {
              setActiveTask(null, projectId);
            },
            isCancelled ? 2500 : 7000
          );
        }
      } catch (err) {
        console.warn("[SSE] Error parsing event message", err);
      }
    };

    eventSource.onerror = (err) => {
      // Browser EventSource automatically attempts reconnection
      console.debug("[SSE] Stream reconnecting...", err);
    };

    return () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
      }
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
      }
      eventSource.close();
    };
  }, [projectId, queryClient, setActiveTask, showToast]);
}
