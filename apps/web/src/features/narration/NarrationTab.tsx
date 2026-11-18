import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Loader2,
  BookOpen,
  Edit3,
  CheckCircle2,
  FileText,
  ArrowRight,
  Copy,
  Check,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { useEditorConfigStore } from "@/lib/store";
import { StudioTabHeader } from "@/components/layout";
import { Project, Narration, Scene } from "@/types";
import { Button, Input, Slider, Textarea } from "@/components/ui";
import { SectionPanel, EmptyState } from "@/components/fragments";
import { cn } from "@/lib/utils";

interface NarrationTabProps {
  project: Project & {
    narration?: Narration | null;
    scenes: Scene[];
  };
}

// Must match SEC_PER_LINE in apps/api/app/services/narrative.py
const SEC_PER_LINE = 4.5;

export function NarrationTab({ project }: NarrationTabProps) {
  const queryClient = useQueryClient();
  const { showToast, setActiveTab } = useStudioStore();
  const { getShortsConfig, setShortsStepConfig } = useEditorConfigStore();
  const saved = getShortsConfig(project.id, project).narration;

  const [templateId, setTemplateId] = useState(saved.preset || "auto");
  const [topic, setTopic] = useState(saved.topic ?? "");
  const [duration, setDuration] = useState(saved.duration || 55);
  const [rawText, setRawText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const { data: templates = [] } = useQuery({ queryKey: ["templates"], queryFn: api.getTemplates });
  const selected = templates.find((t) => t.id === templateId) || templates[0];

  useEffect(() => {
    if (project.narration) setRawText(project.narration.raw_text);
  }, [project.narration]);

  useEffect(() => {
    setShortsStepConfig(project.id, "narration", { topic, preset: templateId, duration });
  }, [project.id, topic, templateId, duration, setShortsStepConfig]);

  const generateMutation = useMutation({
    mutationFn: () =>
      api.generateNarration(project.id, {
        template_id: selected?.id || templateId,
        topic,
        target_duration: duration,
      }),
    onMutate: () => setElapsed(0),
    onSuccess: async (data) => {
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
      setRawText(data.raw_text);
      setIsEditing(false);
      showToast("Naskah berhasil dibuat", "success");
    },
    onError: (err: Error) => showToast(err.message || "Gagal generate naskah", "error"),
  });
  const isGenerating = generateMutation.isPending;

  useEffect(() => {
    if (!isGenerating) return;
    const timer = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [isGenerating]);

  const updateMutation = useMutation({
    mutationFn: () => api.updateNarration(project.id, { raw_text: rawText }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      setIsEditing(false);
      showToast("Naskah disimpan", "success");
    },
    onError: (err: Error) => showToast(err.message || "Gagal menyimpan naskah", "error"),
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(rawText);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  const sceneById = new Map(project.scenes.map((s) => [s.id, s]));
  const segments = project.narration?.segments || [];

  return (
    <div>
      <StudioTabHeader
        icon={FileText}
        title="Narasi video"
        description="Pilih gaya, atur durasi, lalu generate. Tiap kalimat ditulis untuk satu potongan video."
      />
      <div className="mx-auto w-full max-w-[1920px] px-4 py-5 sm:px-6">
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-5">
            <SectionPanel
              title="Gaya naskah"
              icon={<BookOpen className="h-4 w-4 text-primary" />}
              className="!border-surface-border !bg-card"
              headerClassName="!border-surface-border !bg-card"
            >
              <div className="space-y-2">
                {templates.map((tpl) => {
                  const isSelected = selected?.id === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setTemplateId(tpl.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition",
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background hover:border-primary/40 hover:bg-muted"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <h4 className="truncate text-xs font-bold text-foreground">{tpl.name}</h4>
                          {isSelected && (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                          )}
                        </div>
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {tpl.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </SectionPanel>

            <SectionPanel
              title="Isi naskah"
              className="!border-surface-border !bg-card"
              headerClassName="!border-surface-border !bg-card"
              icon={<Sparkles className="h-4 w-4 text-primary" />}
            >
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="narration-topic"
                    className="mb-1.5 block text-xs font-semibold text-foreground"
                  >
                    Topik (opsional)
                  </label>
                  <Input
                    id="narration-topic"
                    type="text"
                    placeholder="Mis. Kenapa kimchi dikubur di dalam tanah?"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </div>

                <div>
                  <label
                    htmlFor="narration-duration"
                    className="mb-1.5 flex justify-between text-xs font-semibold text-foreground"
                  >
                    <span>Durasi</span>
                    <span className="font-mono text-muted-foreground">
                      {duration} detik · ≈ {Math.max(4, Math.round(duration / SEC_PER_LINE))}{" "}
                      kalimat
                    </span>
                  </label>
                  <Slider
                    id="narration-duration"
                    min={15}
                    max={90}
                    step={5}
                    value={[duration]}
                    onValueChange={([v]) => setDuration(v)}
                    aria-label="Durasi narasi"
                  />
                </div>

                <Button
                  onClick={() => generateMutation.mutate()}
                  disabled={isGenerating || !selected}
                  variant="workspace-primary"
                  size="lg"
                  className="w-full gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>
                        Menyusun naskah… {Math.floor(elapsed / 60)}:
                        {String(elapsed % 60).padStart(2, "0")}
                      </span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Generate naskah</span>
                    </>
                  )}
                </Button>
              </div>
            </SectionPanel>
          </div>

          <div className="lg:col-span-7">
            <SectionPanel
              title="Naskah"
              description="Satu baris = satu potongan video. Saat edit, jaga jumlah baris agar potongannya tetap cocok."
              className="!border-surface-border !bg-card"
              headerClassName="!border-surface-border !bg-card"
              icon={<FileText className="h-4 w-4 text-primary" />}
              actions={
                rawText ? (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                      className="h-7 gap-1 text-xs"
                    >
                      {hasCopied ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span>{hasCopied ? "Tersalin" : "Salin"}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (isEditing) setRawText(project.narration?.raw_text || "");
                        setIsEditing(!isEditing);
                      }}
                      className="h-7 gap-1 text-xs"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>{isEditing ? "Batal" : "Edit"}</span>
                    </Button>
                    {isEditing && (
                      <Button
                        variant="workspace-primary"
                        size="sm"
                        onClick={() => updateMutation.mutate()}
                        disabled={updateMutation.isPending}
                        className="h-7 gap-1 text-xs"
                      >
                        {updateMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        <span>Simpan</span>
                      </Button>
                    )}
                  </div>
                ) : null
              }
            >
              {!rawText ? (
                <EmptyState
                  icon={Sparkles}
                  title="Naskah belum dibuat"
                  description="Pilih gaya, atur durasi, lalu klik Generate naskah."
                />
              ) : (
                <div className="space-y-4">
                  {isEditing ? (
                    <Textarea
                      rows={14}
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      className="text-sm leading-relaxed"
                      aria-label="Edit naskah"
                    />
                  ) : (
                    <ol className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                      {segments.map((seg, idx) => {
                        const scene = seg.scene_id ? sceneById.get(seg.scene_id) : undefined;
                        return (
                          <li
                            key={seg.id || idx}
                            className="flex items-center gap-3 rounded-lg border border-border bg-background p-2 text-sm"
                          >
                            <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">
                              {idx + 1}
                            </span>
                            {scene?.thumbnail_url ? (
                              <img
                                src={scene.thumbnail_url}
                                alt={scene.description || ""}
                                title={scene.description || ""}
                                className="h-12 w-20 shrink-0 rounded object-cover"
                              />
                            ) : (
                              <div className="h-12 w-20 shrink-0 rounded bg-muted" />
                            )}
                            <p className="flex-1 leading-relaxed text-foreground/90">{seg.text}</p>
                            {seg.end_ms > 0 && (
                              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                {(seg.start_ms / 1000).toFixed(1)}s
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}

                  <div className="flex items-center justify-end border-t border-border pt-3">
                    <Button
                      onClick={() => setActiveTab("tts")}
                      variant="workspace-primary"
                      size="sm"
                      className="gap-2"
                    >
                      <span>Lanjut ke suara</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </SectionPanel>
          </div>
        </div>
      </div>
    </div>
  );
}
