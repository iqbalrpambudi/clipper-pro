"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  FileText,
  ArrowRight,
  Plus,
  Trash2,
  Save,
  Loader2,
  Volume2,
  Code2,
  Check,
  Clock3,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import type { MotionScene, Project } from "@/types";
import { MOTION_THEME_LIST } from "@/lib/motion";
import { StudioTabHeader } from "@/components/layout/StudioTabHeader";
import {
  Button,
  Input,
  Textarea,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";

interface MotionScriptTabProps {
  project: Project;
}

export const MOTION_ARCHETYPE_OPTIONS = [
  { id: "kinetic_emblem", label: "Kinetic Emblem & Hook" },
  { id: "node_flowchart", label: "Node Flowchart & Laser SVG" },
  { id: "split_spotlight", label: "Split Stage Spotlight" },
  { id: "window_simulation", label: "Window / Terminal Simulation" },
  { id: "process_pipeline", label: "Progressive Pipeline" },
  { id: "data_viz_stage", label: "Bespoke Data Viz & Counter" },
  { id: "comparison_duel", label: "Comparison / Transformation Duel" },
] as const;

const DURATION_PRESETS = [30, 60, 90, 120, 180] as const;

const TONE_OPTIONS = [
  { id: "edukatif_dinamis", label: "Edukatif Dinamis (Kurzgesagt / Vox)" },
  { id: "keynote_eksekutif", label: "Keynote Produk (Apple / Linear)" },
  { id: "teknikal_mendalam", label: "Arsitektur Sistem & AI Deep-Dive" },
  { id: "data_finansial", label: "Analitik Data & Strategi Bisnis" },
  { id: "viral_punchy", label: "Punchy & Cepat (High Retention)" },
] as const;

interface SceneBlueprintCardProps {
  projectId: string;
  scene: MotionScene;
  index: number;
}

function SceneBlueprintCard({ projectId, scene, index }: SceneBlueprintCardProps) {
  const queryClient = useQueryClient();
  const showToast = useStudioStore((s) => s.showToast);

  const [title, setTitle] = useState(scene.title || "");
  const [archetype, setArchetype] = useState(scene.archetype || "kinetic_emblem");
  const [scriptText, setScriptText] = useState(scene.script_text || "");
  const [visualConcept, setVisualConcept] = useState(scene.visual_concept || "");
  const [durationSec, setDurationSec] = useState<string>(
    String(Math.round((scene.duration || 4.5) * 10) / 10)
  );

  useEffect(() => {
    setTitle(scene.title || "");
    setArchetype(scene.archetype || "kinetic_emblem");
    setScriptText(scene.script_text || "");
    setVisualConcept(scene.visual_concept || "");
    setDurationSec(String(Math.round((scene.duration || 4.5) * 10) / 10));
  }, [scene.id, scene.updated_at, scene.title, scene.archetype, scene.script_text, scene.visual_concept, scene.duration]);

  const isDirty =
    title !== (scene.title || "") ||
    archetype !== (scene.archetype || "kinetic_emblem") ||
    scriptText !== (scene.script_text || "") ||
    visualConcept !== (scene.visual_concept || "") ||
    Math.abs((parseFloat(durationSec) || 4.5) - (scene.duration || 4.5)) > 0.05;

  const updateMutation = useMutation({
    mutationFn: () => {
      const parsedDur = Math.max(1.5, Math.min(25, parseFloat(durationSec) || 4.5));
      return api.updateMotionScene(projectId, scene.id, {
        title: title.trim() || `Adegan ${index + 1}`,
        archetype,
        script_text: scriptText.trim(),
        visual_concept: visualConcept.trim(),
        duration: parsedDur,
        duration_frames: Math.max(45, Math.round(parsedDur * 30)),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["motion-scenes", projectId] });
      showToast(`Blueprint adegan #${index + 1} tersimpan.`, "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal menyimpan adegan", "error");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteMotionScene(projectId, scene.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["motion-scenes", projectId] });
      showToast(`Adegan #${index + 1} dihapus.`, "info");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal menghapus adegan", "error");
    },
  });

  const statusTone =
    scene.status === "ready"
      ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : scene.status === "generating"
        ? "border-primary/30 bg-primary/10 text-primary"
        : scene.status === "failed"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-muted-foreground";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/35">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-accent font-mono text-xs font-bold tabular-nums text-accent-foreground">
            {String(index + 1).padStart(2, "0")}
          </span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`Judul Adegan ${index + 1}`}
            className="h-8 max-w-xs text-xs font-semibold"
          />
          <Badge variant="outline" className={`font-mono text-[10px] ${statusTone}`}>
            {scene.status === "ready"
              ? "TSX Siap"
              : scene.status === "generating"
                ? "Mensintesis"
                : scene.status === "failed"
                  ? "Perlu Remix"
                  : "Blueprint"}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-48">
            <Select value={archetype} onValueChange={setArchetype}>
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent appearance="workspace">
                {MOTION_ARCHETYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/60 px-2 py-1">
            <Clock3 className="h-3 w-3 text-muted-foreground" />
            <input
              type="number"
              step="0.5"
              min="1.5"
              max="25"
              value={durationSec}
              onChange={(e) => setDurationSec(e.target.value)}
              aria-label={`Durasi adegan ${index + 1} dalam detik`}
              className="w-11 bg-transparent text-right font-mono text-xs font-semibold tabular-nums text-foreground focus:outline-none"
            />
            <span className="font-mono text-[10px] text-muted-foreground">dtk</span>
          </div>

          {isDirty && (
            <Button
              type="button"
              size="workspace-sm"
              variant="workspace-primary"
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
              className="h-8 gap-1 text-xs"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span>Simpan</span>
            </Button>
          )}

          <button
            type="button"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            title="Hapus adegan ini"
            aria-label={`Hapus adegan ${index + 1}`}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
          >
            {deleteMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
            Narasi Voiceover (Dibaca TTS & Disinkronkan ke Frame Cue)
          </label>
          <Textarea
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            rows={3}
            placeholder="Tulis kalimat narasi untuk adegan ini..."
            className="resize-none text-xs leading-relaxed"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
            Arahan Koreografi Visual & Metafora SVG (Instruksi untuk AI TSX Coder)
          </label>
          <Textarea
            value={visualConcept}
            onChange={(e) => setVisualConcept(e.target.value)}
            rows={3}
            placeholder="Mis. Hub vektor di tengah memancarkan 3 garis sinyal bezier ke kartu metrik yang melayang saat angka naik ke 340%..."
            className="resize-none text-xs leading-relaxed"
          />
        </div>
      </div>

      {scene.key_facts && scene.key_facts.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-medium text-muted-foreground">Token Visual:</span>
          {scene.key_facts.map((fact, fIdx) => (
            <span
              key={`${fact}-${fIdx}`}
              className="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono text-[10px] text-foreground"
            >
              {fact}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function MotionScriptTab({ project }: MotionScriptTabProps) {
  const queryClient = useQueryClient();
  const { setActiveTab, showToast } = useStudioStore();

  const initialThemeId = useMemo(() => {
    const ws = project.world_setting as Record<string, unknown> | null | undefined;
    return typeof ws?.motion_theme === "string" ? ws.motion_theme : "claude_editorial";
  }, [project.world_setting]);

  const [topic, setTopic] = useState(project.description || project.name || "");
  const [targetDurationSecs, setTargetDurationSecs] = useState<number>(60);
  const [tone, setTone] = useState<string>("edukatif_dinamis");
  const [language, setLanguage] = useState<"id" | "en">(
    project.language === "en" ? "en" : "id"
  );
  const [themeId, setThemeId] = useState<string>(initialThemeId);
  const [customInstructions, setCustomInstructions] = useState<string>("");

  useEffect(() => {
    setThemeId(initialThemeId);
  }, [initialThemeId]);

  const scenes: MotionScene[] = useMemo(() => {
    const raw = project.motion_scenes || [];
    return [...raw].sort((a, b) => a.order_index - b.order_index);
  }, [project.motion_scenes]);

  const totalSeconds = useMemo(
    () => scenes.reduce((sum, s) => sum + (s.duration || 4.5), 0),
    [scenes]
  );

  const totalFrames = useMemo(
    () => scenes.reduce((sum, s) => sum + Math.max(45, s.duration_frames || 120), 0),
    [scenes]
  );

  const updateThemeMutation = useMutation({
    mutationFn: (nextThemeId: string) =>
      api.updateProject(project.id, {
        world_setting: {
          ...((project.world_setting as Record<string, unknown>) || {}),
          motion_theme: nextThemeId,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    },
  });

  const generateScriptMutation = useMutation({
    mutationFn: () =>
      api.generateMotionScript(project.id, {
        topic: topic.trim() || project.name,
        target_duration_secs: targetDurationSecs,
        tone,
        language,
        theme_id: themeId,
        custom_instructions: customInstructions.trim() || undefined,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      queryClient.invalidateQueries({ queryKey: ["motion-scenes", project.id] });
      showToast(
        `Berhasil merancang ${res.scene_count} blueprint adegan motion graphic!`,
        "success"
      );
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal merancang naskah motion graphic", "error");
    },
  });

  const addSceneMutation = useMutation({
    mutationFn: () =>
      api.createMotionScene(project.id, {
        title: `Adegan Baru ${scenes.length + 1}`,
        archetype: "node_flowchart",
        script_text: "Tuliskan narasi singkat untuk memicu animasi pada adegan ini.",
        visual_concept:
          "Diagram arsitektur dengan tiga kartu melayang yang terhubung oleh jalur vektor animasi bertahap.",
        duration: 4.5,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      queryClient.invalidateQueries({ queryKey: ["motion-scenes", project.id] });
      showToast("Adegan baru ditambahkan ke urutan storyboard motion.", "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal menambah adegan", "error");
    },
  });

  const handleSelectTheme = (nextId: string) => {
    setThemeId(nextId);
    updateThemeMutation.mutate(nextId);
  };

  return (
    <div className="flex w-full flex-col pb-16">
      <StudioTabHeader
        icon={FileText}
        title="Naskah & Blueprint Koreografi Motion"
        badge="Langkah 1 • Konsep"
        secondaryBadge={`${project.aspect_ratio || "16:9"} • 30 FPS`}
        description="Rancang narasi sekaligus arahan koreografi visual per adegan sebelum disintesis menjadi kode animasi React/Remotion."
        actions={
          scenes.length > 0 ? (
            <>
              <Button
                variant="workspace-secondary"
                size="workspace-sm"
                onClick={() => setActiveTab("motion_studio")}
                className="gap-1.5 text-xs"
              >
                <Code2 className="h-3.5 w-3.5" />
                <span>Langsung ke Motion Studio</span>
              </Button>
              <Button
                variant="workspace-primary"
                size="workspace-sm"
                onClick={() => setActiveTab("motion_voice")}
                className="gap-1.5 text-xs"
              >
                <Volume2 className="h-3.5 w-3.5" />
                <span>Lanjut ke Suara & Cue Sync</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="mx-auto grid w-full max-w-[1920px] grid-cols-1 items-start gap-6 px-4 py-5 sm:px-6 lg:grid-cols-12">
        {/* Left Column: AI Creative Director Brief & Theme World */}
        <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Brief Topik & Gaya Art Direction
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              AI Director memecah topik menjadi adegan cepat (3,5–6,5 detik) dengan metafora
              diagram, simulasi window, dan visualisasi data dinamis.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">
              Topik atau Konsep yang Ingin Dijelaskan
            </label>
            <Textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={4}
              placeholder="Mis. Bagaimana Model Bahasa Besar (LLM) memproses token secara paralel lewat mekanisme Self-Attention dibanding pembacaan sekuensial lama..."
              className="text-xs leading-relaxed"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">
                Target Durasi Video
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {DURATION_PRESETS.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setTargetDurationSecs(sec)}
                    className={`rounded-lg border py-2 font-mono text-xs font-semibold tabular-nums transition ${
                      targetDurationSecs === sec
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">
                Bahasa Narasi
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setLanguage("id")}
                  className={`rounded-lg border py-2 text-xs font-semibold transition ${
                    language === "id"
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Indonesia
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage("en")}
                  className={`rounded-lg border py-2 text-xs font-semibold transition ${
                    language === "en"
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  English
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">
              Gaya Penyampaian & Ritme
            </label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent appearance="workspace">
                {TONE_OPTIONS.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 6 Art Direction Worlds */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-foreground">
              Dunia Visual (Art Direction Palette)
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {MOTION_THEME_LIST.map((theme) => {
                const selected = theme.id === themeId;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => handleSelectTheme(theme.id)}
                    className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${
                      selected
                        ? "border-primary bg-accent/60 ring-1 ring-primary/25"
                        : "border-border bg-muted/30 hover:border-primary/40"
                    }`}
                  >
                    <div
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
                      style={{
                        backgroundColor: theme.bg,
                        borderColor: theme.border,
                      }}
                    >
                      <div className="flex items-center gap-0.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: theme.accent }}
                        />
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: theme.accent2 }}
                        />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-xs font-semibold text-foreground">
                          {theme.name}
                        </span>
                        {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      </div>
                      <p className="line-clamp-1 text-[10px] text-muted-foreground">
                        {theme.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">
              Catatan Arahan Tambahan (Opsional)
            </label>
            <Input
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="Mis. Fokus pada angka efisiensi biaya, sertakan perbandingan arsitektur lama vs baru..."
              className="h-9 text-xs"
            />
          </div>

          <Button
            type="button"
            variant="workspace-primary"
            onClick={() => generateScriptMutation.mutate()}
            disabled={generateScriptMutation.isPending || !topic.trim()}
            className="w-full gap-2 py-2.5 text-xs"
          >
            {generateScriptMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Merancang Naskah & Koreografi Adegan...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>
                  {scenes.length > 0
                    ? "Generate Ulang Naskah & Blueprint Motion"
                    : "Susun Naskah & Blueprint Motion AI"}
                </span>
              </>
            )}
          </Button>
        </div>

        {/* Right Column: Editable Scene Blueprint Sequence */}
        <div className="space-y-4 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-sm">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Urutan Adegan Motion ({scenes.length} Adegan)
              </h2>
              <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                Estimasi total: {Math.round(totalSeconds * 10) / 10} detik ({totalFrames} frame @
                30fps)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="workspace-secondary"
                size="workspace-sm"
                onClick={() => addSceneMutation.mutate()}
                disabled={addSceneMutation.isPending}
                className="gap-1.5 text-xs"
              >
                {addSceneMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                <span>Tambah Adegan</span>
              </Button>

              {scenes.length > 0 && (
                <Button
                  type="button"
                  variant="workspace-primary"
                  size="workspace-sm"
                  onClick={() => setActiveTab("motion_voice")}
                  className="gap-1.5 text-xs"
                >
                  <span>Suara & Cue Sync</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          {scenes.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-accent text-accent-foreground">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                Belum Ada Blueprint Adegan Motion
              </h3>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                Masukkan topik di panel kiri lalu klik{" "}
                <strong className="text-foreground">Susun Naskah & Blueprint Motion AI</strong>,
                atau tambahkan adegan secara manual untuk langsung menulis komponen Remotion TSX.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {scenes.map((scene, idx) => (
                <SceneBlueprintCard
                  key={scene.id}
                  projectId={project.id}
                  scene={scene}
                  index={idx}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
