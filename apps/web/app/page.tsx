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
    <div className="min-h-screen flex flex-col bg-[#090A0F]">
      {/* Top Navbar */}
      <header className="border-b border-surface-border bg-surface/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-accent-blue flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-brand-400">
                  Cliper Pro
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/20 border border-brand-500/30 text-brand-300 font-semibold uppercase tracking-wider">
                  v1.0 AI
                </span>
              </div>
              <p className="text-xs text-slate-400">Auto Short Video Maker</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-surface-hover border border-surface-border transition"
            >
              <SettingsIcon className="w-4 h-4 text-slate-400" />
              <span>Model Settings</span>
            </Link>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white shadow-lg shadow-brand-600/25 transition transform active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>New Project</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <main className="max-w-7xl mx-auto px-6 py-10 flex-1 w-full">
        <div className="relative rounded-3xl p-8 mb-10 overflow-hidden border border-white/10 bg-gradient-to-br from-surface-card via-surface to-surface-card/60 shadow-2xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-accent-yellow/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs font-semibold mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              TikTok & Reels Viral Video Automation
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight mb-3">
              Ubah Video Panjang Jadi{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 via-accent-blue to-accent-yellow">
                Short Video Viral
              </span>{" "}
              dalam Hitungan Menit.
            </h1>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed mb-6">
              Otomatisasi lengkap: deteksi scene visual, generate naskah Bahasa Indonesia dengan LLM pilihan, voice Gemini 2.5 TTS, subtitle karaoke ASS presisi (gaya Hormozi & TikTok), dan render vertikal 9:16 dengan background fill blur.
            </p>

            <button
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-slate-950 font-bold hover:bg-slate-100 transition shadow-xl"
            >
              <span>Mulai Buat Video Baru</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Section: Projects List */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Project Saya</h2>
            <p className="text-xs text-slate-400">Pilih project untuk masuk ke Studio Editor</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-48 rounded-2xl bg-surface-card animate-pulse border border-surface-border" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center border-dashed border-2 border-surface-border">
            <Film className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-white mb-1">Belum Ada Project</h3>
            <p className="text-sm text-slate-400 max-w-sm mx-auto mb-5">
              Mulai buat project pertama Anda dengan mengunggah video atau menempel link YouTube.
            </p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition"
            >
              Buat Project Pertama
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((proj) => (
              <div
                key={proj.id}
                className="group relative glass-panel rounded-2xl p-5 border border-surface-border hover:border-brand-500/40 transition-all flex flex-col justify-between hover:shadow-xl hover:shadow-brand-500/5"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-brand-500/10 text-brand-300 border border-brand-500/20">
                      {proj.aspect_ratio} • {proj.resolution}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setProjectToEdit(proj);
                          setEditName(proj.name);
                          setEditDescription(proj.description || "");
                        }}
                        className="text-slate-500 hover:text-brand-300 p-1.5 rounded-lg hover:bg-white/5 transition"
                        title="Edit Nama Project"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setProjectToDelete(proj);
                        }}
                        className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-white/5 transition"
                        title="Hapus Project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <Link href={`/projects/${proj.id}`}>
                    <h3 className="text-base font-bold text-white group-hover:text-brand-400 transition mb-2">
                      {proj.name}
                    </h3>
                  </Link>
                  {proj.description && (
                    <p className="text-xs text-slate-400 line-clamp-2 mb-4">
                      {proj.description}
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t border-surface-border/60 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Video className="w-3.5 h-3.5 text-slate-500" />
                      {proj.source_video_count || 0} Media
                    </span>
                    <span className="flex items-center gap-1">
                      <Film className="w-3.5 h-3.5 text-slate-500" />
                      {proj.scene_count || 0} Scene
                    </span>
                  </div>

                  <Link
                    href={`/projects/${proj.id}`}
                    className="flex items-center gap-1 text-brand-400 font-semibold group-hover:translate-x-1 transition"
                  >
                    <span>Studio</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal: New Project */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-scale-pop">
          <div className="w-full max-w-md bg-surface-card border border-surface-border rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Buat Project Baru</h3>
            <p className="text-xs text-slate-400 mb-5">
              Tentukan nama dan format video short yang ingin diproduksi.
            </p>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nama Project
                </label>
                <input
                  type="text"
                  required
                  placeholder="Mis. Fakta Menakjubkan Lautan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-surface-border text-white text-sm focus:outline-none focus:border-brand-500 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Aspect Ratio
                  </label>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-sm focus:outline-none focus:border-brand-500"
                  >
                    <option value="9:16">9:16 (TikTok/Reels/Shorts)</option>
                    <option value="1:1">1:1 (Square Feed)</option>
                    <option value="16:9">16:9 (Landscape)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Resolusi
                  </label>
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-sm focus:outline-none focus:border-brand-500"
                  >
                    <option value="1080p">1080p (Full HD)</option>
                    <option value="720p">720p (Fast Render)</option>
                  </select>
                </div>
              </div>


              <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm shadow-lg shadow-brand-500/20 transition"
                >
                  {createMutation.isPending ? "Membuat..." : "Buat Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Project */}
      {projectToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-scale-pop">
          <div className="w-full max-w-md bg-surface-card border border-surface-border rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-1">
              <Edit3 className="w-5 h-5 text-brand-400" />
              <h3 className="text-lg font-bold text-white">Edit Nama Project</h3>
            </div>
            <p className="text-xs text-slate-400 mb-5">
              Ubah nama atau deskripsi project video Anda.
            </p>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nama Project
                </label>
                <input
                  type="text"
                  required
                  placeholder="Mis. Fakta Menakjubkan Lautan"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-surface-border text-white text-sm focus:outline-none focus:border-brand-500 transition"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Deskripsi (Opsional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Catatan atau tema video..."
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500 transition leading-relaxed resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
                <button
                  type="button"
                  onClick={() => setProjectToEdit(null)}
                  className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm shadow-lg shadow-brand-500/20 transition flex items-center gap-2"
                >
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan Perubahan</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete Project */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-scale-pop">
          <div className="w-full max-w-md bg-surface-card border border-surface-border rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Hapus Project?</h3>
                <p className="text-xs text-slate-400">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              Apakah Anda yakin ingin menghapus project{" "}
              <span className="font-semibold text-white">"{projectToDelete.name}"</span>? Seluruh media video, scene AI, dan naskah di dalamnya akan dihapus permanen.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-surface-border/60">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white transition"
              >
                Batal
              </button>
              <button
                type="button"
                id="confirm-delete-project-btn"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  const id = projectToDelete.id;
                  setProjectToDelete(null);
                  deleteMutation.mutate(id);
                }}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm shadow-lg shadow-rose-600/20 transition flex items-center gap-2"
              >
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>Hapus Project</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
