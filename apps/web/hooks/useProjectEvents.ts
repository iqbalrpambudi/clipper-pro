"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStudioStore, TaskEvent } from "@/lib/store";

export function useProjectEvents(projectId: string) {
  const queryClient = useQueryClient();
  const { setActiveTask, showToast } = useStudioStore();
  const clearTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
    const streamUrl = `${baseUrl}/api/v1/projects/${projectId}/events`;
    const eventSource = new EventSource(streamUrl);

    eventSource.onopen = () => {
      console.log(`[SSE] Connected to project events stream (${projectId})`);
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

        if (clearTimerRef.current) {
          clearTimeout(clearTimerRef.current);
          clearTimerRef.current = null;
        }

        setActiveTask(task);

        // Auto-refresh queries for real-time sync during render or tasks
        if (task.task_type === "render") {
          queryClient.invalidateQueries({ queryKey: ["render-jobs", projectId] });
        }

        if (task.status === "success") {
          showToast(task.message || "Proses berhasil diselesaikan!", "success");
          queryClient.invalidateQueries({ queryKey: ["project", projectId] });
          queryClient.refetchQueries({ queryKey: ["project", projectId] });
          queryClient.invalidateQueries({ queryKey: ["render-jobs", projectId] });
          queryClient.refetchQueries({ queryKey: ["render-jobs", projectId] });
          queryClient.invalidateQueries({ queryKey: ["scenes", projectId] });
          queryClient.refetchQueries({ queryKey: ["scenes", projectId] });

          // Retain success status briefly, then auto-dismiss
          clearTimerRef.current = setTimeout(() => {
            setActiveTask(null);
          }, 3500);
        } else if (task.status === "error") {
          showToast(task.error || task.message || "Terjadi kesalahan pada worker background", "error");
          queryClient.invalidateQueries({ queryKey: ["project", projectId] });
          queryClient.refetchQueries({ queryKey: ["project", projectId] });
          queryClient.invalidateQueries({ queryKey: ["render-jobs", projectId] });
          queryClient.refetchQueries({ queryKey: ["render-jobs", projectId] });
          queryClient.invalidateQueries({ queryKey: ["scenes", projectId] });
          queryClient.refetchQueries({ queryKey: ["scenes", projectId] });

          // Keep error visible longer so user can read what went wrong
          clearTimerRef.current = setTimeout(() => {
            setActiveTask(null);
          }, 7000);
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
      eventSource.close();
    };
  }, [projectId, queryClient, setActiveTask, showToast]);
}
