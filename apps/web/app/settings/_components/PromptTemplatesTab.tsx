"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Copy, Loader2, Trash2, Check, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { NarrationTemplate } from "@/types";
import { Badge, Button, Input, NativeSelect, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

// Tone is only a word put into the prompt ("nada santai"), so a short fixed list is enough.
const TONES = ["informatif", "santai", "hangat", "dramatis", "tegang"];

type Form = Pick<NarrationTemplate, "name" | "description" | "system_prompt" | "default_tone">;

export function PromptTemplatesTab() {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();
  const { data: templates = [] } = useQuery({ queryKey: ["templates"], queryFn: api.getTemplates });

  const [selectedId, setSelectedId] = useState("");
  const current = templates.find((t) => t.id === selectedId) || templates[0];
  const [form, setForm] = useState<Form>({ name: "", description: "", system_prompt: "", default_tone: "informatif" });

  useEffect(() => {
    if (current) {
      setForm({
        name: current.name,
        description: current.description || "",
        system_prompt: current.system_prompt,
        default_tone: current.default_tone,
      });
    }
  }, [current]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["templates"] });
  const onError = (err: Error) => showToast(err.message || "Gagal", "error");

  const saveMutation = useMutation({
    mutationFn: () => api.updateTemplate(current!.id, form),
    onSuccess: () => {
      refresh();
      showToast("Template disimpan", "success");
    },
    onError,
  });

  const duplicateMutation = useMutation({
    mutationFn: (src: NarrationTemplate) =>
      api.createTemplate({
        id: `${src.id}_${Date.now().toString(36)}`,
        name: `${src.name} (salinan)`,
        description: src.description,
        system_prompt: src.system_prompt,
        default_tone: src.default_tone,
      }),
    onSuccess: (tpl) => {
      refresh();
      setSelectedId(tpl.id);
      showToast("Salinan dibuat, silakan edit", "success");
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteTemplate(id),
    onSuccess: () => {
      refresh();
      setSelectedId("");
      showToast("Template dihapus", "info");
    },
    onError,
  });

  const readOnly = !!current?.is_builtin;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-2 lg:col-span-4">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Template naskah</h3>
        </div>
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => setSelectedId(tpl.id)}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-lg border p-3 text-left text-xs transition",
              current?.id === tpl.id ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted"
            )}
          >
            <span className="truncate font-semibold text-foreground">{tpl.name}</span>
            <Badge variant="secondary" className="shrink-0 text-xs">
              {tpl.is_builtin ? "Bawaan" : "Kustom"}
            </Badge>
          </button>
        ))}
      </div>

      {current && (
        <div className="space-y-4 lg:col-span-8">
          {readOnly && (
            <p className="flex items-center gap-2 rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              Template bawaan tidak bisa diubah. Klik Duplikat untuk membuat versi sendiri.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="tpl-name" className="mb-1.5 block text-xs font-semibold">Nama</label>
              <Input
                id="tpl-name"
                value={form.name}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="tpl-tone" className="mb-1.5 block text-xs font-semibold">Nada</label>
              <NativeSelect
                id="tpl-tone"
                value={form.default_tone}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, default_tone: e.target.value })}
              >
                {[...new Set([...TONES, form.default_tone])].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div>
            <label htmlFor="tpl-desc" className="mb-1.5 block text-xs font-semibold">Deskripsi</label>
            <Input
              id="tpl-desc"
              value={form.description || ""}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="tpl-style" className="mb-1.5 block text-xs font-semibold">Gaya</label>
            <Textarea
              id="tpl-style"
              rows={7}
              value={form.system_prompt}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
              className="font-mono text-xs"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Tulis 3-5 baris pendek: kalimat pertama seperti apa, isi tiap kalimat, dan kalimat terakhir. Aturan
              format (jumlah baris, satu kalimat per potongan video) ditambahkan otomatis.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            {!readOnly && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => deleteMutation.mutate(current.id)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" /> Hapus
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => duplicateMutation.mutate(current)}
              disabled={duplicateMutation.isPending}
            >
              <Copy className="h-3.5 w-3.5" /> Duplikat
            </Button>
            {!readOnly && (
              <Button
                variant="workspace-primary"
                size="sm"
                className="gap-1.5"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Simpan
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
