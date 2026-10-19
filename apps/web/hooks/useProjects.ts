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
    refetchOnWindowFocus: true,
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
      const mode = newProj.project_type === "long_storyboard" ? "storyboard" : "short";
      router.push(`/project/${mode}/${newProj.id}`);
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

export function useUpdateProject() {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Pick<Project, "name" | "description" | "project_type" | "aspect_ratio" | "resolution" | "background_fill" | "language">>;
    }) => api.updateProject(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(updated.id) });
      showToast("Project berhasil diperbarui!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal memperbarui project", "error");
    },
  });
}

