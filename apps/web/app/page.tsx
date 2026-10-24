"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Plus,
  Film,
  Search,
  RotateCcw,
  ArrowRight,
  Clock3,
  Video,
  Image as ImageIcon,
  Trash2,
  Edit3,
  AlertTriangle,
} from "lucide-react";
import {
  useProjects,
  useCreateProject,
  useDeleteProject,
  useUpdateProject,
} from "@/hooks/useProjects";
import { Project } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui";
import { WorkspaceShell } from "@/components/layout";
import {
  ProjectCard,
  ProjectFilter,
  ProjectModeFilter,
  ProjectSortOption,
  CreateProjectDialog,
  EditProjectDialog,
  DeleteProjectDialog,
} from "@/components/dashboard";

const projectDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const projectStatusLabels: Record<string, string> = {
  draft: "Draft",
  processing: "Diproses",
  ready: "Siap diedit",
  rendering: "Sedang dirender",
  completed: "Selesai",
  failed: "Perlu diperiksa",
};

function formatProjectDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Tanggal tidak tersedia"
    : projectDateFormatter.format(date);
}

export default function DashboardPage() {
  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"short_video" | "long_storyboard">("short_video");
  const [name, setName] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [resolution, setResolution] = useState("1080p");
  const [language, setLanguage] = useState<"id" | "en">("id");

  // Edit Project State
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLanguage, setEditLanguage] = useState<"id" | "en">("id");

  // Delete Project State
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  // Filter & Search states
  const [modeFilter, setModeFilter] = useState<ProjectModeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<ProjectSortOption>("newest");

  // React Query Hooks
  const { data: projects = [], isLoading } = useProjects();
  const createMutation = useCreateProject();
  const deleteMutation = useDeleteProject();
  const updateMutation = useUpdateProject();
  const { data: modelConfig } = useQuery({
    queryKey: ["model-config"],
    queryFn: api.getModelConfig,
    staleTime: 5 * 60 * 1000,
  });
  const needsApiKeySetup = modelConfig && !modelConfig.has_api_key;

  // Mode counts
  const shortCount = useMemo(
    () => projects.filter((p) => (p.project_type || "short_video") === "short_video").length,
    [projects]
  );
  const storyboardCount = useMemo(
    () => projects.filter((p) => p.project_type === "long_storyboard").length,
    [projects]
  );

  // Filtered & Sorted Projects
  const filteredProjects = useMemo(() => {
    const result = projects.filter((p) => {
      // 1. Mode filter
      if (modeFilter !== "all") {
        const type = p.project_type || "short_video";
        if (type !== modeFilter) return false;
      }
      // 2. Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchName = p.name?.toLowerCase().includes(query);
        const matchDesc = p.description?.toLowerCase().includes(query);
        if (!matchName && !matchDesc) return false;
      }
      return true;
    });

    // 3. Sorting
    result.sort((a, b) => {
      if (sortOption === "name_asc") {
        return a.name.localeCompare(b.name);
      }
      if (sortOption === "name_desc") {
        return b.name.localeCompare(a.name);
      }
      if (sortOption === "oldest") {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeA - timeB;
      }
      // Default: newest
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });

    return result;
  }, [projects, modeFilter, searchQuery, sortOption]);

  const featuredProject = useMemo(
    () =>
      filteredProjects.reduce<Project | null>((latest, project) => {
        if (!latest) return project;
        return new Date(project.updated_at).getTime() > new Date(latest.updated_at).getTime()
          ? project
          : latest;
      }, null),
    [filteredProjects]
  );

  const otherProjects = featuredProject
    ? filteredProjects.filter((project) => project.id !== featuredProject.id)
    : filteredProjects;

  const handleOpenCreate = (mode: "short_video" | "long_storyboard" = "short_video") => {
    setCreateMode(mode);
    setAspectRatio(mode === "long_storyboard" ? "16:9" : "9:16");
    setName("");
    setIsCreateOpen(true);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate(
      {
        name: name.trim(),
        project_type: createMode,
        aspect_ratio: aspectRatio,
        resolution,
        language,
      },
      {
        onSuccess: () => {
          setIsCreateOpen(false);
          setName("");
        },
      }
    );
  };

  const handleOpenEdit = (proj: Project) => {
    setProjectToEdit(proj);
    setEditName(proj.name);
    setEditDescription(proj.description || "");
    setEditLanguage((proj.language as "id" | "en") || "id");
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectToEdit || !editName.trim()) return;
    updateMutation.mutate(
      {
        id: projectToEdit.id,
        data: {
          name: editName.trim(),
          description: editDescription.trim() || undefined,
          language: editLanguage,
        },
      },
      {
        onSuccess: () => {
          setProjectToEdit(null);
          setEditName("");
          setEditDescription("");
        },
      }
    );
  };

  const handleDeleteConfirm = () => {
    if (projectToDelete) {
      deleteMutation.mutate(projectToDelete.id, {
        onSuccess: () => setProjectToDelete(null),
      });
    }
  };

  const handleResetFilters = () => {
    setModeFilter("all");
    setSearchQuery("");
    setSortOption("newest");
  };

  return (
    <WorkspaceShell activePage="projects">
      <div className="workspace-dashboard">
        <header className="workspace-dashboard-intro">
          <div>
            <p className="workspace-page-eyebrow">Ruang kerja kreatif</p>
            <h1 className="workspace-page-title">
              Bahan mentah,
              <br />
              cerita baru.
            </h1>
            <p className="workspace-page-description">
              Semua project video Anda, dari klip pertama sampai siap tayang. Lanjutkan yang sudah
              dimulai atau buka ruang cerita baru.
            </p>
          </div>
          <Button
            onClick={() => handleOpenCreate("short_video")}
            className="workspace-create-button"
          >
            <Plus className="h-4 w-4" />
            Buat project
          </Button>
        </header>

        {/* Onboarding banner: API key not configured */}
        {needsApiKeySetup && (
          <div className="mx-auto max-w-5xl px-6 pt-4">
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-900">
                  API Key belum dikonfigurasi
                </p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Fitur AI (narasi, TTS, gambar) membutuhkan API key. Atur di Pengaturan untuk
                  mulai membuat video.
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100">
                <Link href="/settings">Atur API Key</Link>
              </Button>
            </div>
          </div>
        )}

        {featuredProject && !isLoading && (
          <section className="workspace-featured-section" aria-labelledby="featured-project-title">
            <div className="workspace-section-heading">
              <div>
                <h2 className="workspace-section-title">Lanjutkan dari sini</h2>
                <p>Terakhir diperbarui {formatProjectDate(featuredProject.updated_at)}</p>
              </div>
            </div>
            <article className="workspace-featured-card">
              <div className="workspace-featured-copy">
                <span className="workspace-status-pill">
                  <span className="workspace-status-dot" aria-hidden="true" />
                  {projectStatusLabels[featuredProject.status] || featuredProject.status}
                </span>
                <div>
                  <h3 id="featured-project-title">{featuredProject.name}</h3>
                  <p>
                    {featuredProject.description ||
                      (featuredProject.project_type === "long_storyboard"
                        ? "Lanjutkan menyusun storyboard dan ilustrasi project ini."
                        : "Lanjutkan memilih media dan menyusun klip video project ini.")}
                  </p>
                </div>
                <div className="workspace-featured-footer">
                  <div className="workspace-project-facts">
                    {featuredProject.project_type === "long_storyboard" ? (
                      <span>
                        <ImageIcon aria-hidden="true" /> {featuredProject.storyboard_count || 0}{" "}
                        ilustrasi
                      </span>
                    ) : (
                      <>
                        <span>
                          <Video aria-hidden="true" /> {featuredProject.source_video_count || 0}{" "}
                          media
                        </span>
                        <span>
                          <Film aria-hidden="true" /> {featuredProject.scene_count || 0} scene
                        </span>
                      </>
                    )}
                    <span>
                      <Clock3 aria-hidden="true" /> Diperbarui
                    </span>
                  </div>
                  <div className="workspace-featured-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleOpenEdit(featuredProject)}
                      className="workspace-featured-icon-action"
                      title="Ubah nama project"
                      aria-label={`Ubah nama project ${featuredProject.name}`}
                    >
                      <Edit3 aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setProjectToDelete(featuredProject)}
                      className="workspace-featured-icon-action workspace-delete-project"
                      title="Hapus project"
                      aria-label={`Hapus project ${featuredProject.name}`}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                    <Button asChild className="workspace-open-project">
                      <Link
                        href={
                          featuredProject.project_type === "long_storyboard"
                            ? `/project/storyboard/${featuredProject.id}`
                            : `/project/short/${featuredProject.id}`
                        }
                      >
                        Buka project <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
              <div className="workspace-featured-art" aria-hidden="true">
                <span className="workspace-art-orb" />
                <span className="workspace-art-frame">
                  {featuredProject.project_type === "long_storyboard"
                    ? "STORYBOARD"
                    : "VIDEO PROJECT"}
                  <small>
                    {featuredProject.aspect_ratio} · {featuredProject.resolution}
                  </small>
                </span>
              </div>
            </article>
          </section>
        )}

        <section className="workspace-projects-section" aria-labelledby="projects-heading">
          <div className="workspace-section-heading workspace-projects-heading">
            <div>
              <h2 id="projects-heading" className="workspace-section-title">
                Project Anda
              </h2>
              <p>Tempat setiap potongan mulai menemukan bentuknya.</p>
            </div>
          </div>
          <ProjectFilter
            modeFilter={modeFilter}
            onModeFilterChange={setModeFilter}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            sortOption={sortOption}
            onSortOptionChange={setSortOption}
            totalCount={projects.length}
            shortCount={shortCount}
            storyboardCount={storyboardCount}
            filteredCount={filteredProjects.length}
            onResetFilters={handleResetFilters}
          />

          {isLoading ? (
            <div className="workspace-project-grid" aria-label="Memuat project">
              {[1, 2, 3].map((n) => (
                <div key={n} className="workspace-project-skeleton" />
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            projects.length === 0 ? (
              <div className="workspace-empty-state">
                <span className="workspace-empty-icon">
                  <Film aria-hidden="true" />
                </span>
                <h3>Belum ada project</h3>
                <p>
                  Mulai buat video pendek dari koleksi media Anda atau susun naskah storyboard
                  dengan ilustrasi AI.
                </p>
                <div className="workspace-empty-actions">
                  <Button
                    onClick={() => handleOpenCreate("short_video")}
                    className="workspace-create-button"
                  >
                    <Plus className="h-4 w-4" /> Buat short video
                  </Button>
                  <Button
                    onClick={() => handleOpenCreate("long_storyboard")}
                    variant="outline"
                    className="workspace-secondary-button"
                  >
                    <Plus className="h-4 w-4" /> Buat storyboard
                  </Button>
                </div>
              </div>
            ) : (
              <div className="workspace-empty-state workspace-empty-filtered">
                <span className="workspace-empty-icon">
                  <Search aria-hidden="true" />
                </span>
                <h3>Tidak ada project yang sesuai</h3>
                <p>Tidak ditemukan project yang cocok dengan filter atau kata kunci Anda.</p>
                <Button
                  onClick={handleResetFilters}
                  variant="outline"
                  className="workspace-secondary-button"
                >
                  <RotateCcw className="h-4 w-4" /> Reset filter
                </Button>
              </div>
            )
          ) : (
            <div className="workspace-project-grid">
              {otherProjects.map((proj) => (
                <ProjectCard
                  key={proj.id}
                  project={proj}
                  onEdit={handleOpenEdit}
                  onDelete={setProjectToDelete}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Dialog: Create Project */}
      <CreateProjectDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        createMode={createMode}
        setCreateMode={setCreateMode}
        name={name}
        setName={setName}
        aspectRatio={aspectRatio}
        setAspectRatio={setAspectRatio}
        resolution={resolution}
        setResolution={setResolution}
        language={language}
        setLanguage={setLanguage}
        onSubmit={handleCreate}
        isPending={createMutation.isPending}
      />

      {/* Dialog: Edit Project */}
      <EditProjectDialog
        open={!!projectToEdit}
        onOpenChange={(open) => !open && setProjectToEdit(null)}
        name={editName}
        setName={setEditName}
        description={editDescription}
        setDescription={setEditDescription}
        language={editLanguage}
        setLanguage={setEditLanguage}
        onSubmit={handleEditSubmit}
        isPending={updateMutation.isPending}
      />

      {/* Dialog: Delete Confirmation */}
      <DeleteProjectDialog
        project={projectToDelete}
        open={!!projectToDelete}
        onOpenChange={(open) => !open && setProjectToDelete(null)}
        onConfirm={handleDeleteConfirm}
        isPending={deleteMutation.isPending}
      />
    </WorkspaceShell>
  );
}
