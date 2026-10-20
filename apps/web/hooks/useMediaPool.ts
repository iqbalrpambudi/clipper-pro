import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { SourceVideo, Scene, ProjectDetail } from "@/types";

export function useDeleteMedia(projectId: string) {
  const queryClient = useQueryClient();
  const { showToast, activeTask, setActiveTask } = useStudioStore();

  return useMutation({
    mutationFn: (vidId: string) => api.deleteMedia(projectId, vidId),
    onMutate: async (vidId: string) => {
      await queryClient.cancelQueries({ queryKey: ["project", projectId] });

      const prevProject = queryClient.getQueryData<ProjectDetail>(["project", projectId]);

      // Optimistically remove video and its scenes from the project query cache immediately
      queryClient.setQueryData<ProjectDetail>(["project", projectId], (old) => {
        if (!old) return old;
        return {
          ...old,
          source_videos: (old.source_videos || []).filter((v: SourceVideo) => v.id !== vidId),
          scenes: (old.scenes || []).filter((s: Scene) => s.source_video_id !== vidId),
        };
      });

      // Instantly clear active task if it was on this video
      if (activeTask?.data?.video_id === vidId) {
        setActiveTask(null, projectId);
      }

      return { prevProject };
    },
    onError: (err: Error, _vidId, context) => {
      if (context?.prevProject) {
        queryClient.setQueryData(["project", projectId], context.prevProject);
      }
      showToast(err.message || "Gagal menghapus video", "error");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onSuccess: () => {
      showToast("Video dihapus dari Media Pool", "info");
    },
  });
}

export function useCancelMedia(projectId: string) {
  const queryClient = useQueryClient();
  const { showToast, setActiveTask } = useStudioStore();

  return useMutation({
    mutationFn: (vidId: string) => api.cancelMedia(projectId, vidId),
    onSuccess: (res) => {
      showToast(res.message || "Proses video dibatalkan", "info");
      setActiveTask(null, projectId);
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal membatalkan proses video", "error");
    },
  });
}

export function useDownloadYT(projectId: string) {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();

  return useMutation({
    mutationFn: ({ url, formatId, title }: { url: string; formatId: string; title?: string }) =>
      api.downloadYT(projectId, url, formatId, title),
    onSuccess: (newVid: SourceVideo) => {
      if (newVid) {
        queryClient.setQueryData<ProjectDetail>(["project", projectId], (old) => {
          if (!old) return old;
          const exists = (old.source_videos || []).some((v: SourceVideo) => v.id === newVid.id);
          if (exists) return old;
          return {
            ...old,
            source_videos: [newVid, ...(old.source_videos || [])],
          };
        });
      }
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      showToast("Download YouTube dimulai di background!", "info");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal mendownload YouTube", "error");
    },
  });
}

export function useUploadMedia(projectId: string) {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();

  return useMutation({
    mutationFn: (formData: FormData) => api.uploadMedia(projectId, formData),
    onSuccess: (uploadedVideos: SourceVideo[]) => {
      queryClient.setQueryData<ProjectDetail>(["project", projectId], (old) => {
        if (!old) return old;
        return {
          ...old,
          source_videos: [...(uploadedVideos || []), ...(old.source_videos || [])],
        };
      });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      showToast(
        "Video berhasil diunggah! Scene detection sedang berjalan di background.",
        "success"
      );
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal mengunggah video", "error");
    },
  });
}

export function useModelConfig() {
  return useQuery({
    queryKey: ["model-config"],
    queryFn: api.getModelConfig,
    staleTime: 60000,
  });
}

export function useYTInfo(projectId: string) {
  const { showToast } = useStudioStore();

  return useMutation({
    mutationFn: (url: string) => api.getYTInfo(projectId, url),
    onError: (err: Error) => {
      showToast(err.message || "Gagal menginspeksi video YouTube", "error");
    },
  });
}

export function useRetagScenes(projectId: string) {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();

  return useMutation({
    mutationFn: (mode: "quick" | "force") => api.retagScenes(projectId, mode),
    onSuccess: async (res) => {
      await queryClient.refetchQueries({ queryKey: ["project", projectId] });
      await queryClient.refetchQueries({ queryKey: ["scenes", projectId] });
      showToast(res.message || `Berhasil tagging ${res.count} scene!`, "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal tagging ulang scene", "error");
    },
  });
}

export function useTranscribeScenes(projectId: string) {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();

  return useMutation({
    mutationFn: (language: string = "id") => api.transcribeScenes(projectId, language),
    onSuccess: async (res) => {
      await queryClient.refetchQueries({ queryKey: ["project", projectId] });
      await queryClient.refetchQueries({ queryKey: ["scenes", projectId] });
      showToast(res.message || "Transkripsi dialog audio dijadwalkan!", "info");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal memulai transkripsi dialog", "error");
    },
  });
}

export function useRepairThumbnails(projectId: string) {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();

  return useMutation({
    mutationFn: () => api.repairThumbnails(projectId),
    onSuccess: async (res) => {
      await queryClient.refetchQueries({ queryKey: ["project", projectId] });
      await queryClient.refetchQueries({ queryKey: ["scenes", projectId] });
      showToast(res.message || `Berhasil memperbaiki ${res.repaired} thumbnail!`, "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal meregenerasi thumbnail", "error");
    },
  });
}
