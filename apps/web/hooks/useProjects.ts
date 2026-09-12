import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project } from "@/types";

export const projectKeys = {
  all: ["projects"] as const,
  detail: (id: string) => ["project", id] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: api.getProjects,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => api.getProject(id),
    staleTime: 10000,
    refetchInterval: (query) => {
      const p = query.state.data;
      const isVideoBusy = p?.source_videos?.some(
        (v: any) => v.status === "processing" || v.status === "pending" || v.status === "downloading"
      );
      const isAudioBusy = p?.audio?.status === "generating" || p?.audio?.status === "processing";
      const isRenderBusy = p?.render_jobs?.some(
        (j: any) =>
          j.status === "processing" ||
          j.status === "pending" ||
          j.status === "rendering" ||
          j.status === "queued"
      );
      const isNarrationBusy =
        p?.narration?.status === "generating" || p?.narration?.status === "tts_generating";

      return isVideoBusy || isAudioBusy || isRenderBusy || isNarrationBusy ? 2500 : false;
    },
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useStudioStore();

  return useMutation({
    mutationFn: api.createProject,
    onSuccess: (newProj) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      showToast("Project baru berhasil dibuat!", "success");
      router.push(`/projects/${newProj.id}`);
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal membuat project", "error");
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();

  return useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onMutate: async (id: string) => {
      // Cancel outgoing refetches so they don't overwrite optimistic update
      await queryClient.cancelQueries({ queryKey: projectKeys.all });

      // Snapshot previous projects for rollback
      const previousProjects = queryClient.getQueryData<Project[]>(projectKeys.all);

      // Optimistically remove project from cache immediately (0 ms delay)
      queryClient.setQueryData<Project[]>(projectKeys.all, (old) => {
        if (!old) return old;
        return old.filter((p) => p.id !== id);
      });

      return { previousProjects };
    },
    onError: (err: any, _id, context) => {
      if (context?.previousProjects) {
        queryClient.setQueryData(projectKeys.all, context.previousProjects);
      }
      showToast(err.message || "Gagal menghapus project", "error");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
    onSuccess: () => {
      showToast("Project berhasil dihapus", "info");
    },
  });
}
