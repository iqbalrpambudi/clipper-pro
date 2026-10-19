"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Sparkles,
  Plus,
  Settings as SettingsIcon,
  Palette,
  Film,
  Search,
  RotateCcw,
} from "lucide-react";
import {
  useProjects,
  useCreateProject,
  useDeleteProject,
  useUpdateProject,
} from "@/hooks/useProjects";
import { Project } from "@/types";
import { Button, Badge } from "@/components/ui";
import {
  ProjectCard,
  ProjectFilter,
  ProjectModeFilter,
  ProjectSortOption,
  CreateProjectDialog,
  EditProjectDialog,
  DeleteProjectDialog,
} from "@/components/dashboard";

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
    let result = projects.filter((p) => {
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
    <div className="min-h-screen flex flex-col bg-[#121212]">
      {/* Top Navbar */}
      <header className="border-b border-[#2E2E2E] bg-[#171717]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-8xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#3ECF8E] to-[#2DA670] flex items-center justify-center shadow-lg shadow-[#3ECF8E]/20 text-[#032817]">
              <Sparkles className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-white font-sans">
                  Cliper Pro
                </span>
                <Badge variant="supabase" className="text-[10px] uppercase font-mono tracking-wider">
                  v2.0 Dual-Mode
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">AI Video & Storyboard Studio</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/image-studio">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs border-[#2E2E2E] text-violet-300 hover:text-white hover:border-violet-500/50"
              >
                <Palette className="w-4 h-4 text-violet-400" />
                <span>Visual Image Studio</span>
              </Button>
            </Link>
            <Link href="/settings">
              <Button variant="outline" size="sm" className="gap-2 text-xs border-[#2E2E2E]">
                <SettingsIcon className="w-4 h-4 text-muted-foreground" />
                <span>Model Settings</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area: Project List & Filters Only */}
      <main className="max-w-8xl mx-auto flex-1 w-full px-6 py-8">
        {/* Dashboard Title & Quick Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Project Saya</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Kelola dan lanjutkan pembuatan video pendek & storyboard Anda
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => handleOpenCreate("short_video")}
              variant="supabase"
              size="sm"
              className="gap-2 text-xs shadow-md shadow-[#3ECF8E]/10"
            >
              <Plus className="w-4 h-4" />
              <span>Project Baru</span>
            </Button>
          </div>
        </div>

        {/* Filter & Search Bar */}
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

        {/* Projects Grid or States */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="h-44 rounded-xl bg-[#1C1C1C] animate-pulse border border-[#2E2E2E]"
              />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          projects.length === 0 ? (
            /* Empty State when zero total projects exist */
            <div className="flex flex-col items-center justify-center text-center p-12 rounded-2xl border-2 border-dashed border-[#2E2E2E] bg-[#181818]/40">
              <div className="w-14 h-14 rounded-2xl bg-[#242424] border border-[#2E2E2E] flex items-center justify-center text-muted-foreground mb-4 shadow-inner">
                <Film className="w-7 h-7 text-[#3ECF8E]" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1.5">Belum Ada Project</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6 leading-relaxed">
                Mulai buat video pendek TikTok/Reels dari YouTube atau susun naskah storyboard explainer dengan ilustrasi AI.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  onClick={() => handleOpenCreate("short_video")}
                  variant="supabase"
                  size="sm"
                  className="gap-2 font-medium"
                >
                  <Plus className="w-4 h-4" />
                  <span>Buat Short Video (9:16)</span>
                </Button>
                <Button
                  onClick={() => handleOpenCreate("long_storyboard")}
                  variant="outline"
                  size="sm"
                  className="gap-2 border-violet-500/40 text-violet-300 hover:text-white hover:bg-violet-600/20 font-medium"
                >
                  <Plus className="w-4 h-4 text-violet-400" />
                  <span>Buat Long Storyboard (16:9)</span>
                </Button>
              </div>
            </div>
          ) : (
            /* Empty State when filters/search yield no matches */
            <div className="flex flex-col items-center justify-center text-center p-12 rounded-2xl border-2 border-dashed border-[#2E2E2E] bg-[#181818]/40">
              <div className="w-12 h-12 rounded-xl bg-[#242424] border border-[#2E2E2E] flex items-center justify-center text-muted-foreground mb-3.5">
                <Search className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">
                Tidak ada project yang sesuai
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mb-5 leading-relaxed">
                Tidak ditemukan project yang cocok dengan filter atau kata kunci pencarian Anda.
              </p>
              <Button
                onClick={handleResetFilters}
                variant="outline"
                size="sm"
                className="gap-2 text-xs border-[#2E2E2E]"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#3ECF8E]" />
                <span>Reset Semua Filter</span>
              </Button>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((proj) => (
              <ProjectCard
                key={proj.id}
                project={proj}
                onEdit={handleOpenEdit}
                onDelete={setProjectToDelete}
              />
            ))}
          </div>
        )}
      </main>

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
    </div>
  );
}
