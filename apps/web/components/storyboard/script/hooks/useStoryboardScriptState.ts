"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import {
  Project,
  ProjectDetail,
  StoryboardItem,
  StoryboardCharacter,
  StoryboardLocation,
  StoryboardWorldSetting,
  SentenceSegment,
} from "@/types";
import { presetStorage, ScriptPreset } from "@/lib/presetStorage";

export function useStoryboardScriptState(project: Project) {
  const queryClient = useQueryClient();
  const { setActiveTab, showToast, scriptDraftsByProject, setScriptDraft } = useStudioStore();
  const draft = scriptDraftsByProject[project.id];

  const { data: presets = [] } = useQuery({
    queryKey: ["image-presets"],
    queryFn: api.getImagePresets,
  });

  const activePreset = presets.find((p) => p.is_active) || presets[0];
  const [selectedPresetId, setSelectedPresetId] = useState<string>(draft?.selectedPresetId || "");

  useEffect(() => {
    if (activePreset && !selectedPresetId && !draft?.selectedPresetId) {
      setSelectedPresetId(activePreset.id);
    }
  }, [activePreset, selectedPresetId, draft?.selectedPresetId]);

  const [topic, setTopic] = useState<string>(
    draft?.topic !== undefined ? draft.topic : project.narration?.topic || project.name || ""
  );
  const [durationMins, setDurationMins] = useState<number>(
    draft?.durationMins !== undefined
      ? draft.durationMins
      : project.narration?.target_duration
        ? Math.round(project.narration.target_duration / 60)
        : 5
  );
  const [tone, setTone] = useState<string>(draft?.tone || project.narration?.tone || "santai");
  const [language, setLanguage] = useState<string>(
    project.narration?.language || project.language || "id"
  );
  const [imagesPerSegment, setImagesPerSegment] = useState<number>(draft?.imagesPerSegment ?? 2);
  const [customInstructions, setCustomInstructions] = useState<string>(
    draft?.customInstructions || ""
  );

  const handleLanguageSelect = (newLang: string) => {
    setLanguage(newLang);
    api.updateProject(project.id, { language: newLang }).then(() => {
      queryClient.setQueryData<ProjectDetail>(["project", project.id], (old) => {
        if (!old) return old;
        return { ...old, language: newLang };
      });
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    });
  };

  useEffect(() => {
    if (project.narration?.language) {
      setLanguage(project.narration.language);
    }
  }, [project.narration?.language]);

  // Script & Narration Presets
  const [scriptPresets, setScriptPresets] = useState<ScriptPreset[]>([]);
  const [selectedScriptPresetId, setSelectedScriptPresetId] = useState<string>(
    draft?.selectedScriptPresetId || ""
  );
  const [showSaveScriptModal, setShowSaveScriptModal] = useState<boolean>(false);
  const [newScriptPresetName, setNewScriptPresetName] = useState<string>("");

  // Sync script draft across tab switches
  useEffect(() => {
    setScriptDraft(project.id, {
      topic,
      durationMins,
      tone,
      selectedPresetId,
      selectedScriptPresetId,
      imagesPerSegment,
      customInstructions,
    });
  }, [
    project.id,
    topic,
    durationMins,
    tone,
    selectedPresetId,
    selectedScriptPresetId,
    imagesPerSegment,
    customInstructions,
    setScriptDraft,
  ]);

  useEffect(() => {
    setScriptPresets(presetStorage.getScriptPresets());
  }, []);

  const handleLoadScriptPreset = (presetId: string) => {
    setSelectedScriptPresetId(presetId);
    const found = scriptPresets.find((p) => p.id === presetId);
    if (!found) return;
    setDurationMins(found.durationMins);
    setTone(found.tone);
    if (found.presetId) setSelectedPresetId(found.presetId);
    setImagesPerSegment(found.imagesPerSegment);
    setCustomInstructions(found.customInstructions || "");
    showToast(`Preset naskah "${found.name}" berhasil dimuat!`, "success");
  };

  const handleSaveScriptPreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScriptPresetName.trim()) {
      showToast("Nama preset tidak boleh kosong", "error");
      return;
    }
    const saved = presetStorage.saveScriptPreset({
      name: newScriptPresetName.trim(),
      durationMins,
      tone,
      presetId: selectedPresetId || undefined,
      imagesPerSegment,
      customInstructions,
    });
    setScriptPresets(presetStorage.getScriptPresets());
    setSelectedScriptPresetId(saved.id);
    setNewScriptPresetName("");
    setShowSaveScriptModal(false);
    showToast(`Preset "${saved.name}" berhasil disimpan!`, "success");
  };

  const handleDeleteScriptPreset = (id: string, name: string) => {
    presetStorage.deleteScriptPreset(id);
    const remaining = presetStorage.getScriptPresets();
    setScriptPresets(remaining);
    if (selectedScriptPresetId === id) setSelectedScriptPresetId("");
    showToast(`Preset "${name}" dihapus`, "info");
  };

  // Story Continuity Bible state (Characters & Variants, Locations, World Setting)
  const [bibleTab, setBibleTab] = useState<"characters" | "locations" | "world">("characters");
  const [editingBible, setEditingBible] = useState<boolean>(false);
  const [charactersList, setCharactersList] = useState<StoryboardCharacter[]>(
    project.characters || []
  );
  const [locationsList, setLocationsList] = useState<StoryboardLocation[]>(project.locations || []);
  const [worldSetting, setWorldSetting] = useState<StoryboardWorldSetting>(
    project.world_setting || {}
  );

  useEffect(() => {
    if (project.characters) setCharactersList(project.characters);
    if (project.locations) setLocationsList(project.locations);
    if (project.world_setting) setWorldSetting(project.world_setting);
  }, [project.characters, project.locations, project.world_setting]);

  const handleAddCharacter = () => {
    const idx = charactersList.length + 1;
    setCharactersList((prev) => [
      ...prev,
      {
        id: `char_${idx}`,
        name: `Tokoh ${idx}`,
        role: "Tokoh Utama",
        visual_anchor: "",
        variants: [],
      },
    ]);
    setBibleTab("characters");
    setEditingBible(true);
  };

  const handleDeleteCharacter = (idx: number) => {
    setCharactersList((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddVariant = (charIdx: number) => {
    setCharactersList((prev) => {
      const updated = [...prev];
      const char = { ...updated[charIdx] };
      const variants = Array.isArray(char.variants) ? [...char.variants] : [];
      variants.push({
        variant_id: `varian_${variants.length + 1}`,
        label: `Varian ${variants.length + 1}`,
        visual_anchor: "",
      });
      char.variants = variants;
      updated[charIdx] = char;
      return updated;
    });
    setEditingBible(true);
  };

  const handleDeleteVariant = (charIdx: number, varIdx: number) => {
    setCharactersList((prev) => {
      const updated = [...prev];
      const char = { ...updated[charIdx] };
      if (Array.isArray(char.variants)) {
        char.variants = char.variants.filter((_, i) => i !== varIdx);
      }
      updated[charIdx] = char;
      return updated;
    });
  };

  const handleAddLocation = () => {
    const idx = locationsList.length + 1;
    setLocationsList((prev) => [
      ...prev,
      {
        id: `lokasi_${idx}`,
        name: `Lokasi ${idx}`,
        environment_anchor: "",
      },
    ]);
    setBibleTab("locations");
    setEditingBible(true);
  };

  const handleDeleteLocation = (idx: number) => {
    setLocationsList((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateBibleMutation = useMutation({
    mutationFn: () =>
      api.updateStoryboardContinuityBible(project.id, {
        characters: charactersList,
        locations: locationsList,
        world_setting: worldSetting,
      }),
    onSuccess: (res) => {
      queryClient.setQueryData<ProjectDetail>(["project", project.id], (old) => {
        if (!old) return old;
        return {
          ...old,
          characters: res.characters || [],
          locations: res.locations || [],
          world_setting: res.world_setting || {},
        };
      });
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      queryClient.invalidateQueries({ queryKey: ["storyboard-items", project.id] });
      setEditingBible(false);
      showToast("Story Continuity Bible berhasil disimpan!", "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal memperbarui Story Continuity Bible", "error");
    },
  });

  const extractBibleMutation = useMutation({
    mutationFn: (data?: { custom_instructions?: string }) =>
      api.extractStoryboardContinuityBible(project.id, data),
    onSuccess: (res) => {
      if (res?.characters) {
        setCharactersList(res.characters);
      }
      if (res?.locations) {
        setLocationsList(res.locations);
      }
      if (res?.world_setting) {
        setWorldSetting(res.world_setting);
      }
      queryClient.setQueryData<ProjectDetail>(["project", project.id], (old) => {
        if (!old) return old;
        return {
          ...old,
          characters: res.characters || [],
          locations: res.locations || [],
          world_setting: res.world_setting || {},
        };
      });
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      queryClient.invalidateQueries({ queryKey: ["storyboard-items", project.id] });
      showToast(
        `Berhasil mengekstrak ${res.characters?.length || 0} karakter & latar dari naskah!`,
        "success"
      );
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal mengekstrak character sheet dari naskah", "error");
    },
  });

  const handleCancelBible = () => {
    setEditingBible(false);
    setCharactersList(project.characters || []);
    setLocationsList(project.locations || []);
    setWorldSetting(project.world_setting || {});
  };

  const [resetBibleOnGenerate, setResetBibleOnGenerate] = useState<boolean>(true);

  const narration = project.narration;
  const segments: (SentenceSegment & { chapter?: string; segment_id?: string })[] =
    (narration?.segments as (SentenceSegment & { chapter?: string; segment_id?: string })[]) || [];
  const items: StoryboardItem[] = project.storyboard_items || [];

  // Narration Copy state & handlers
  const [hasCopiedNarration, setHasCopiedNarration] = useState(false);
  const [copiedSegmentId, setCopiedSegmentId] = useState<string | null>(null);

  const handleCopyAllNarration = () => {
    let fullText = "";
    if (segments && segments.length > 0) {
      fullText = segments
        .map((s) => (s.text || "").trim())
        .filter(Boolean)
        .join("\n\n");
    }
    if (!fullText && narration?.raw_text) {
      fullText = narration.raw_text.trim();
    }

    if (!fullText) {
      showToast("Belum ada teks narasi untuk disalin", "info");
      return;
    }

    navigator.clipboard.writeText(fullText);
    setHasCopiedNarration(true);
    setTimeout(() => setHasCopiedNarration(false), 2500);
    showToast("Seluruh teks narasi berhasil disalin ke clipboard!", "success");
  };

  const handleCopySegment = (segText: string, segKey: string) => {
    if (!segText) return;
    navigator.clipboard.writeText(segText);
    setCopiedSegmentId(segKey);
    setTimeout(() => setCopiedSegmentId(null), 2000);
    showToast("Teks segmen narasi berhasil disalin!", "success");
  };

  // Segment Inline Editing State
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editingSegmentIndex, setEditingSegmentIndex] = useState<number | null>(null);
  const [editChapter, setEditChapter] = useState<string>("");
  const [editText, setEditText] = useState<string>("");
  const [editItemPrompts, setEditItemPrompts] = useState<Record<string, string>>({});

  const handleStartEditSegment = (
    seg: SentenceSegment & { chapter?: string; segment_id?: string },
    idx: number,
    segItems: StoryboardItem[]
  ) => {
    const segId = seg.id || seg.segment_id || `seg-${idx + 1}`;
    setEditingSegmentId(segId);
    setEditingSegmentIndex(idx);
    setEditChapter(seg.chapter || `Babak ${idx + 1}`);
    setEditText(seg.text || "");
    const promptsMap: Record<string, string> = {};
    segItems.forEach((it) => {
      promptsMap[it.id] = it.image_prompt || "";
    });
    setEditItemPrompts(promptsMap);
  };

  const handleCancelEditSegment = () => {
    setEditingSegmentId(null);
    setEditingSegmentIndex(null);
    setEditChapter("");
    setEditText("");
    setEditItemPrompts({});
  };

  const updateSegmentMutation = useMutation({
    mutationFn: ({
      segmentId,
      segmentIndex,
      chapter,
      text,
      items: itemUpdates,
    }: {
      segmentId: string;
      segmentIndex?: number;
      chapter: string;
      text: string;
      items: { id: string; image_prompt: string }[];
    }) =>
      api.updateStoryboardSegment(project.id, segmentId, {
        chapter,
        text,
        segment_index: segmentIndex,
        items: itemUpdates,
      }),
    onSuccess: (data) => {
      if (data?.narration) {
        queryClient.setQueryData<ProjectDetail>(["project", project.id], (old) => {
          if (!old) return old;
          return {
            ...old,
            narration: data.narration,
            storyboard_items: data.storyboard_items || old.storyboard_items || [],
          };
        });
      }
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      queryClient.invalidateQueries({ queryKey: ["storyboard-items", project.id] });
      handleCancelEditSegment();
      showToast("Segmen berhasil diperbarui!", "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal memperbarui segmen", "error");
    },
  });

  const handleSaveEditSegment = (
    segmentId: string,
    segItems: StoryboardItem[],
    segIdx?: number
  ) => {
    const itemsPayload = segItems.map((it) => ({
      id: it.id,
      image_prompt:
        editItemPrompts[it.id] !== undefined ? editItemPrompts[it.id] : it.image_prompt || "",
    }));

    updateSegmentMutation.mutate({
      segmentId,
      segmentIndex:
        segIdx !== undefined
          ? segIdx
          : editingSegmentIndex !== null
            ? editingSegmentIndex
            : undefined,
      chapter: editChapter.trim(),
      text: editText.trim(),
      items: itemsPayload,
    });
  };

  const generateScriptMutation = useMutation({
    mutationFn: (data: {
      topic: string;
      target_duration_mins: number;
      tone: string;
      images_per_segment: number;
      preset_id?: string;
      custom_instructions?: string;
      language?: string;
      reset_bible?: boolean;
    }) => api.generateStoryboardScript(project.id, data),
    onSuccess: (data) => {
      if (data?.characters) {
        setCharactersList(data.characters);
      }
      if (data?.locations) {
        setLocationsList(data.locations);
      }
      if (data?.world_setting) {
        setWorldSetting(data.world_setting);
      }
      if (data?.narration) {
        queryClient.setQueryData<ProjectDetail>(["project", project.id], (old) => {
          if (!old) return old;
          return {
            ...old,
            name: data.project_name || data.narration?.topic || old.name,
            characters: data.characters || [],
            locations: data.locations || [],
            world_setting: data.world_setting || {},
            narration: data.narration,
            storyboard_items: data.storyboard_items || [],
            youtube_metadata: {},
            audio: null,
            audio_track: null,
          };
        });
      }
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Naskah storyboard & adegan gambar berhasil di-generate!", "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal generate naskah storyboard", "error");
    },
  });

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) {
      showToast("Harap masukkan topik ide konten video.", "error");
      return;
    }

    generateScriptMutation.mutate({
      topic: topic.trim(),
      target_duration_mins: durationMins,
      tone,
      images_per_segment: imagesPerSegment,
      preset_id: selectedPresetId || undefined,
      custom_instructions: customInstructions.trim() || undefined,
      language,
      reset_bible: resetBibleOnGenerate,
    });
  };

  // Calculate speech duration directly from generated narration text (standard speech rate: 135 wpm)
  const wordCount = narration?.raw_text ? narration.raw_text.trim().split(/\s+/).length : 0;
  const charCount = narration?.raw_text ? narration.raw_text.length : 0;
  const estimatedSeconds = wordCount > 0 ? Math.round((wordCount / 135) * 60) : 0;
  const resultMinutes = Math.floor(estimatedSeconds / 60);
  const resultSeconds = estimatedSeconds % 60;
  const resultDurationFormatted =
    wordCount === 0
      ? "0 Menit"
      : resultSeconds === 0
        ? `~${resultMinutes} Menit`
        : `~${resultMinutes}m ${resultSeconds}s`;

  return {
    // Presets
    presets,
    activePreset,
    selectedPresetId,
    setSelectedPresetId,
    scriptPresets,
    selectedScriptPresetId,
    showSaveScriptModal,
    setShowSaveScriptModal,
    newScriptPresetName,
    setNewScriptPresetName,
    handleLoadScriptPreset,
    handleSaveScriptPreset,
    handleDeleteScriptPreset,

    // Form inputs
    topic,
    setTopic,
    durationMins,
    setDurationMins,
    tone,
    setTone,
    language,
    handleLanguageSelect,
    imagesPerSegment,
    setImagesPerSegment,
    customInstructions,
    setCustomInstructions,
    resetBibleOnGenerate,
    setResetBibleOnGenerate,
    generateScriptMutation,
    handleGenerate,

    // Continuity Bible
    bibleTab,
    setBibleTab,
    editingBible,
    setEditingBible,
    charactersList,
    setCharactersList,
    locationsList,
    setLocationsList,
    worldSetting,
    setWorldSetting,
    handleAddCharacter,
    handleDeleteCharacter,
    handleAddVariant,
    handleDeleteVariant,
    handleAddLocation,
    handleDeleteLocation,
    handleCancelBible,
    updateBibleMutation,
    extractBibleMutation,

    // Segments & Items
    narration,
    segments,
    items,
    hasCopiedNarration,
    copiedSegmentId,
    handleCopyAllNarration,
    handleCopySegment,
    editingSegmentId,
    editingSegmentIndex,
    editChapter,
    setEditChapter,
    editText,
    setEditText,
    editItemPrompts,
    setEditItemPrompts,
    handleStartEditSegment,
    handleCancelEditSegment,
    handleSaveEditSegment,
    updateSegmentMutation,

    // Metrics
    wordCount,
    charCount,
    resultDurationFormatted,
    setActiveTab,
  };
}
