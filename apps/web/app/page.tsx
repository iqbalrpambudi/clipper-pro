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
  Loader2,
  Edit3,
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
  const [name, setName] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [resolution, setResolution] = useState("1080p");
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  // Edit Project State
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const { data: projects = [], isLoading } = useProjects();
  const createMutation = useCreateProject();
  const deleteMutation = useDeleteProject();
  const updateMutation = useUpdateProject();

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate(
      {
        name: name.trim(),
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
      {/* Top Navbar in Supabase UI style */}
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
                  v1.0 AI
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">Auto Short Video Maker</p>
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
              onClick={() => setIsCreateOpen(true)}
              variant="supabase"
              size="sm"
              className="gap-2 text-xs shadow-md shadow-[#3ECF8E]/10"
            >
              <Plus className="w-4 h-4" />
              <span>New Project</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Banner with Supabase Aesthetic */}
      <main className="max-w-7xl mx-auto px-6 py-10 flex-1 w-full">
        <div className="relative rounded-2xl p-8 mb-10 overflow-hidden border border-[#2E2E2E] bg-gradient-to-br from-[#1C1C1C] via-[#181818] to-[#141414] shadow-2xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#3ECF8E]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-2xl">
            <Badge variant="supabase" className="gap-1.5 px-3 py-1 mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              TikTok & Reels Viral Video Automation
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight mb-3">
              Ubah Video Panjang Jadi{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3ECF8E] via-[#34D399] to-[#6EE7B7]">
                Short Video Viral
              </span>{" "}
              dalam Hitungan Menit.
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base leading-relaxed mb-6">
              Otomatisasi lengkap: deteksi scene visual, generate naskah Bahasa Indonesia dengan LLM pilihan, voice Gemini 2.5 TTS, subtitle karaoke ASS presisi (gaya Hormozi & TikTok), dan render vertikal 9:16 dengan background fill blur.
            </p>

            <Button
              onClick={() => setIsCreateOpen(true)}
              variant="supabase"
              size="lg"
              className="gap-2 font-semibold shadow-lg shadow-[#3ECF8E]/20"
            >
              <span>Mulai Buat Video Baru</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Section: Projects List */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Project Saya</h2>
            <p className="text-xs text-muted-foreground">Pilih project untuk masuk ke Studio Editor</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-48 rounded-xl bg-[#1C1C1C] animate-pulse border border-[#2E2E2E]" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <Card className="p-12 text-center border-dashed border-2 border-[#2E2E2E] bg-[#181818]/50">
            <Film className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-base font-semibold text-white mb-1">Belum Ada Project</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-5">
              Mulai buat project pertama Anda dengan mengunggah video atau menempel link YouTube.
            </p>
            <Button
              onClick={() => setIsCreateOpen(true)}
              variant="supabase"
              size="sm"
            >
              Buat Project Pertama
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((proj) => (
              <Card
                key={proj.id}
                className="group relative border-[#2E2E2E] bg-[#181818] hover:border-[#3ECF8E]/50 hover:bg-[#1C1C1C] transition-all duration-200 flex flex-col justify-between hover:shadow-xl hover:shadow-[#3ECF8E]/5"
              >
                <CardHeader className="p-5 pb-3">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <Badge variant="supabase" className="font-mono text-[11px]">
                      {proj.aspect_ratio} • {proj.resolution}
                    </Badge>
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
                        className="text-muted-foreground hover:text-[#3ECF8E] hover:bg-white/5"
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
                    <CardTitle className="text-base font-bold text-white group-hover:text-[#3ECF8E] transition">
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
                    <span className="flex items-center gap-1">
                      <Video className="w-3.5 h-3.5 text-muted-foreground" />
                      {proj.source_video_count || 0} Media
                    </span>
                    <span className="flex items-center gap-1">
                      <Film className="w-3.5 h-3.5 text-muted-foreground" />
                      {proj.scene_count || 0} Scene
                    </span>
                  </div>

                  <Link
                    href={`/projects/${proj.id}`}
                    className="flex items-center gap-1 text-[#3ECF8E] font-medium group-hover:translate-x-0.5 transition"
                  >
                    <span>Studio</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Supabase UI Dialog: New Project */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Buat Project Baru</DialogTitle>
            <DialogDescription>
              Tentukan nama dan format video short yang ingin diproduksi.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Nama Project
              </label>
              <Input
                type="text"
                required
                placeholder="Mis. Fakta Menakjubkan Lautan"
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
                  <option value="1:1">1:1 (Square Feed)</option>
                  <option value="16:9">16:9 (Landscape)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Resolusi
                </label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="w-full h-9 px-3 py-1 bg-[#181818] rounded-md border border-[#2E2E2E] text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
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

      {/* Supabase UI Dialog: Edit Project */}
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
                placeholder="Mis. Fakta Menakjubkan Lautan"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Deskripsi (Opsional)
              </label>
              <Textarea
                rows={3}
                placeholder="Catatan atau tema video..."
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
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <span>Simpan Perubahan</span>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Supabase UI Dialog: Confirm Delete Project */}
      <Dialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <DialogContent className="max-w-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/15 border border-destructive/30 flex items-center justify-center text-destructive shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-white">Hapus Project?</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Tindakan ini tidak dapat dibatalkan
              </DialogDescription>
            </div>
          </div>

          <p className="text-sm text-foreground/80 leading-relaxed py-2">
            Apakah Anda yakin ingin menghapus project{" "}
            <span className="font-semibold text-white">"{projectToDelete?.name}"</span>? Seluruh media video, scene AI, dan naskah di dalamnya akan dihapus permanen.
          </p>

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
              id="confirm-delete-project-btn"
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!projectToDelete) return;
                const id = projectToDelete.id;
                setProjectToDelete(null);
                deleteMutation.mutate(id);
              }}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              <span>Hapus Project</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
