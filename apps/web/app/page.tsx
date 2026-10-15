"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Plus,
  Video,
  Film,
  Settings as SettingsIcon,
  Trash2,
  ArrowRight,
  Edit3,
  Image as ImageIcon,
} from "lucide-react";
import {
  useProjects,
  useCreateProject,
  useDeleteProject,
  useUpdateProject,
} from "@/hooks/useProjects";
import { Project } from "@/types";
import {
  Button,
  Input,
  Textarea,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui";

export default function DashboardPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"short_video" | "long_storyboard">("short_video");
  const [name, setName] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [resolution, setResolution] = useState("1080p");
  const [modeFilter, setModeFilter] = useState<"all" | "short_video" | "long_storyboard">("all");
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  // Edit Project State
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const { data: projects = [], isLoading } = useProjects();
  const createMutation = useCreateProject();
  const deleteMutation = useDeleteProject();
  const updateMutation = useUpdateProject();

  const shortCount = projects.filter((p) => (p.project_type || "short_video") === "short_video").length;
  const storyboardCount = projects.filter((p) => p.project_type === "long_storyboard").length;

  const filteredProjects = projects.filter((p) => {
    if (modeFilter === "all") return true;
    return (p.project_type || "short_video") === modeFilter;
  });

  const handleOpenCreate = (mode: "short_video" | "long_storyboard") => {
    setCreateMode(mode);
    setAspectRatio(mode === "long_storyboard" ? "16:9" : "9:16");
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
      },
      {
        onSuccess: () => {
          setIsCreateOpen(false);
          setName("");
        },
      }
    );
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

  return (
    <div className="min-h-screen flex flex-col bg-[#121212]">
      {/* Top Navbar */}
      <header className="border-b border-[#2E2E2E] bg-[#171717]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
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
            <Link href="/settings">
              <Button variant="outline" size="sm" className="gap-2 text-xs border-[#2E2E2E]">
                <SettingsIcon className="w-4 h-4 text-muted-foreground" />
                <span>Model Settings</span>
              </Button>
            </Link>
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
      </header>

      {/* Hero Banner with Dual Mode Visual */}
      <main className="max-w-7xl mx-auto flex-1 w-full px-6 py-8">
        <div className="relative p-8 mb-10 overflow-hidden border border-[#2E2E2E] bg-gradient-to-br from-[#1C1C1C] via-[#181818] to-[#141414] shadow-2xl rounded-2xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#3ECF8E]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="supabase" className="gap-1.5 px-3 py-1">
                <Sparkles className="w-3.5 h-3.5" />
                AI Video Engine Multi-Format
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">
                {projects.length} Total Projects
              </span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight mb-3">
              Studio Produksi{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3ECF8E] via-[#34D399] to-[#6EE7B7]">
                Short Video Viral
              </span>{" "}
              &{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-fuchsia-400 to-purple-400">
                Long Storyboard Explainer
              </span>.
            </h1>
            
            <p className="text-muted-foreground text-sm sm:text-base leading-relaxed mb-6">
              Pilih mode produksi Anda: <strong>Short Video Clipper</strong> untuk auto-cut video YouTube menjadi klip 9:16 vertikal dengan subtitle karaoke viral, atau <strong>Long Storyboard Explainer</strong> untuk generate naskah 4–8 menit, suara TTS, dan ilustrasi sketsa hand-drawn AI 16:9.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => handleOpenCreate("short_video")}
                variant="supabase"
                size="lg"
                className="gap-2 font-semibold shadow-lg shadow-[#3ECF8E]/20"
              >
                <Film className="w-4 h-4" />
                <span>Buat Short Video (9:16)</span>
                <ArrowRight className="w-4 h-4" />
              </Button>

              <button
                type="button"
                onClick={() => handleOpenCreate("long_storyboard")}
                className="px-5 py-2.5 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/40 text-violet-200 font-semibold text-sm flex items-center gap-2 transition shadow-lg shadow-violet-500/10"
              >
                <ImageIcon className="w-4 h-4 text-violet-400" />
                <span>Buat Long Storyboard (16:9)</span>
                <ArrowRight className="w-4 h-4 text-violet-400" />
              </button>
            </div>
          </div>
        </div>

        {/* Mode Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Project Saya</h2>
            <p className="text-xs text-muted-foreground">Kelola semua project video dan storyboard Anda</p>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#181818] border border-[#2E2E2E]">
            <button
              onClick={() => setModeFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                modeFilter === "all"
                  ? "bg-[#2A2A2A] text-white shadow-xs"
                  : "text-muted-foreground hover:text-white"
              }`}
            >
              Semua ({projects.length})
            </button>
            <button
              onClick={() => setModeFilter("short_video")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                modeFilter === "short_video"
                  ? "bg-[#3ECF8E]/20 text-[#3ECF8E] font-semibold border border-[#3ECF8E]/30"
                  : "text-muted-foreground hover:text-white"
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Short Video (9:16) ({shortCount})</span>
            </button>
            <button
              onClick={() => setModeFilter("long_storyboard")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                modeFilter === "long_storyboard"
                  ? "bg-violet-500/20 text-violet-300 font-semibold border border-violet-500/30"
                  : "text-muted-foreground hover:text-white"
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Storyboard (16:9) ({storyboardCount})</span>
            </button>
          </div>
        </div>

        {/* Projects Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-48 rounded-xl bg-[#1C1C1C] animate-pulse border border-[#2E2E2E]" />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <Card className="p-12 text-center border-dashed border-2 border-[#2E2E2E] bg-[#181818]/50">
            {modeFilter === "long_storyboard" ? (
              <ImageIcon className="w-12 h-12 text-violet-400/60 mx-auto mb-3" />
            ) : (
              <Film className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            )}
            <h3 className="text-base font-semibold text-white mb-1">
              {modeFilter === "all"
                ? "Belum Ada Project"
                : modeFilter === "long_storyboard"
                ? "Belum Ada Project Long Storyboard"
                : "Belum Ada Project Short Video"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-5">
              {modeFilter === "long_storyboard"
                ? "Mulai buat naskah narasi 4–8 menit dan ilustrasi hand-drawn AI untuk video dokumenter Anda."
                : "Mulai buat short video pertama Anda dengan mengunggah video atau menempel link YouTube."}
            </p>
            <div className="flex justify-center gap-3">
              <Button
                onClick={() => handleOpenCreate(modeFilter === "long_storyboard" ? "long_storyboard" : "short_video")}
                variant="supabase"
                size="sm"
              >
                {modeFilter === "long_storyboard" ? "Buat Long Storyboard" : "Buat Short Video"}
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((proj) => {
              const isStoryboard = proj.project_type === "long_storyboard";
              return (
                <Card
                  key={proj.id}
                  className={`group relative border-[#2E2E2E] bg-[#181818] transition-all duration-200 flex flex-col justify-between hover:bg-[#1C1C1C] hover:shadow-xl ${
                    isStoryboard
                      ? "hover:border-violet-500/50 hover:shadow-violet-500/5"
                      : "hover:border-[#3ECF8E]/50 hover:shadow-[#3ECF8E]/5"
                  }`}
                >
                  <CardHeader className="p-5 pb-3">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      {isStoryboard ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/30">
                          <ImageIcon className="w-3 h-3 text-violet-400" />
                          Storyboard • 16:9 • {proj.resolution}
                        </span>
                      ) : (
                        <Badge variant="supabase" className="font-mono text-[11px]">
                          {proj.aspect_ratio} • {proj.resolution}
                        </Badge>
                      )}
                      
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setProjectToEdit(proj);
                            setEditName(proj.name);
                            setEditDescription(proj.description || "");
                          }}
                          className="text-muted-foreground hover:text-white hover:bg-white/5"
                          title="Edit Nama Project"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setProjectToDelete(proj);
                          }}
                          className="text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10"
                          title="Hapus Project"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    <Link href={`/projects/${proj.id}`}>
                      <CardTitle
                        className={`text-base font-bold text-white transition ${
                          isStoryboard ? "group-hover:text-violet-400" : "group-hover:text-[#3ECF8E]"
                        }`}
                      >
                        {proj.name}
                      </CardTitle>
                    </Link>
                    {proj.description && (
                      <CardDescription className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {proj.description}
                      </CardDescription>
                    )}
                  </CardHeader>

                  <CardFooter className="p-5 pt-3 border-t border-[#2E2E2E]/60 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      {isStoryboard ? (
                        <>
                          <span className="flex items-center gap-1 text-violet-300">
                            <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
                            {proj.storyboard_count || 0} Ilustrasi
                          </span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Film className="w-3.5 h-3.5" />
                            Long Video
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="flex items-center gap-1">
                            <Video className="w-3.5 h-3.5 text-muted-foreground" />
                            {proj.source_video_count || 0} Media
                          </span>
                          <span className="flex items-center gap-1">
                            <Film className="w-3.5 h-3.5 text-muted-foreground" />
                            {proj.scene_count || 0} Scene
                          </span>
                        </>
                      )}
                    </div>

                    <Link
                      href={`/projects/${proj.id}`}
                      className={`flex items-center gap-1 font-medium group-hover:translate-x-0.5 transition ${
                        isStoryboard ? "text-violet-400" : "text-[#3ECF8E]"
                      }`}
                    >
                      <span>{isStoryboard ? "Storyboard Studio" : "Clip Studio"}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Dialog: New Project with Mode Selection Cards */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Buat Project Baru</DialogTitle>
            <DialogDescription>
              Pilih mode pembuatan video yang ingin Anda produksi.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            {/* Mode Selection Cards */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-2">
                Pilih Mode Project
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Card 1: Short Video */}
                <div
                  onClick={() => {
                    setCreateMode("short_video");
                    setAspectRatio("9:16");
                  }}
                  className={`cursor-pointer rounded-xl p-3.5 border transition-all text-left flex flex-col justify-between ${
                    createMode === "short_video"
                      ? "border-[#3ECF8E] bg-[#3ECF8E]/5 ring-1 ring-[#3ECF8E]/30"
                      : "border-[#2E2E2E] bg-[#181818] hover:border-[#3ECF8E]/40"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded-lg bg-[#3ECF8E]/10 flex items-center justify-center text-[#3ECF8E]">
                        <Film className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#3ECF8E]/10 text-[#3ECF8E] font-semibold">
                        9:16 Vertikal
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-white mb-1">Short Video Clipper</h4>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Potong video panjang jadi klip TikTok/Reels viral dengan Scene AI & subtitle karaoke.
                    </p>
                  </div>
                </div>

                {/* Card 2: Long Storyboard */}
                <div
                  onClick={() => {
                    setCreateMode("long_storyboard");
                    setAspectRatio("16:9");
                  }}
                  className={`cursor-pointer rounded-xl p-3.5 border transition-all text-left flex flex-col justify-between ${
                    createMode === "long_storyboard"
                      ? "border-violet-500 bg-violet-500/5 ring-1 ring-violet-500/30"
                      : "border-[#2E2E2E] bg-[#181818] hover:border-violet-500/40"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 font-semibold">
                        16:9 Landscape
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-white mb-1">Long Storyboard Explainer</h4>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Generate naskah 4–8 menit, suara TTS, dan ilustrasi sketsa hand-drawn AI per segmen.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Nama Project
              </label>
              <Input
                type="text"
                required
                placeholder={
                  createMode === "long_storyboard"
                    ? "Mis. Misteri Segitiga Bermuda dan Dimensi Waktu"
                    : "Mis. Fakta Menakjubkan Lautan Dalam"
                }
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Aspect Ratio
                </label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full h-9 px-3 py-1 bg-[#181818] rounded-md border border-[#2E2E2E] text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                >
                  <option value="9:16">9:16 (TikTok/Reels/Shorts)</option>
                  <option value="16:9">16:9 (Landscape YouTube)</option>
                  <option value="1:1">1:1 (Square Feed)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Resolusi
                </label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="w-full h-9 px-3 py-1 bg-[#181818] rounded-md border border-[#2E2E2E] text-foreground text-sm focus:outline-none focus:border-primary"
                >
                  <option value="1080p">1080p (Full HD)</option>
                  <option value="720p">720p (Fast Render)</option>
                </select>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
              >
                Batal
              </Button>
              <Button
                type="submit"
                variant="supabase"
                size="sm"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Membuat..." : "Buat Project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Edit Project */}
      <Dialog open={!!projectToEdit} onOpenChange={(open) => !open && setProjectToEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-[#3ECF8E]" />
              <DialogTitle>Edit Nama Project</DialogTitle>
            </div>
            <DialogDescription>
              Ubah nama atau deskripsi project video Anda.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Nama Project
              </label>
              <Input
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Deskripsi (Opsional)
              </label>
              <Textarea
                rows={3}
                placeholder="Catatan tambahan untuk project ini..."
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setProjectToEdit(null)}
              >
                Batal
              </Button>
              <Button
                type="submit"
                variant="supabase"
                size="sm"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Delete Confirmation */}
      <Dialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400">
                <Trash2 className="w-4 h-4" />
              </div>
              <DialogTitle>Hapus Project</DialogTitle>
            </div>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus project{" "}
              <strong className="text-white font-medium">{projectToDelete?.name}</strong>?
              Semua data media, naskah, timeline, dan hasil render akan dihapus permanen.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setProjectToDelete(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (projectToDelete) {
                  deleteMutation.mutate(projectToDelete.id, {
                    onSuccess: () => setProjectToDelete(null),
                  });
                }
              }}
            >
              {deleteMutation.isPending ? "Menghapus..." : "Hapus Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
