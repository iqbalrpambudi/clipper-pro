"use client";

import React, { useState } from "react";
import {
  X,
  Sparkles,
  Award,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  RefreshCw,
  Check,
  Zap,
  Volume2,
  Flag,
  FileCheck,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { StoryboardNarrationAnalysisResponse, NarrationSegmentImprovement } from "@/types";
import { Button } from "@/components/ui";

interface NarrationAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysisData: StoryboardNarrationAnalysisResponse | null;
  isLoading: boolean;
  isApplying: boolean;
  onAnalyze: (focusAspect?: string, customInstructions?: string) => void;
  onApplyImprovements: (
    selectedSegments: NarrationSegmentImprovement[],
    updateVisualPrompts: boolean
  ) => void;
}

export function NarrationAnalysisModal({
  isOpen,
  onClose,
  analysisData,
  isLoading,
  isApplying,
  onAnalyze,
  onApplyImprovements,
}: NarrationAnalysisModalProps) {
  const [focusAspect, setFocusAspect] = useState<string>("youtube_retention");
  const [customInstructions, setCustomInstructions] = useState<string>("");
  const [showCustomInput, setShowCustomInput] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"overview" | "improvements">("overview");
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<Set<string>>(new Set());
  const [updateVisualPrompts, setUpdateVisualPrompts] = useState<boolean>(true);
  const [showPromptDetails, setShowPromptDetails] = useState<Record<string, boolean>>({});

  // Initialize selected segment IDs when analysis data changes
  React.useEffect(() => {
    if (analysisData?.improved_segments) {
      setSelectedSegmentIds(new Set(analysisData.improved_segments.map((s) => s.segment_id)));
    }
  }, [analysisData]);

  if (!isOpen) return null;

  const toggleSegmentSelection = (segId: string) => {
    const next = new Set(selectedSegmentIds);
    if (next.has(segId)) {
      next.delete(segId);
    } else {
      next.add(segId);
    }
    setSelectedSegmentIds(next);
  };

  const selectAllSegments = () => {
    if (!analysisData?.improved_segments) return;
    setSelectedSegmentIds(new Set(analysisData.improved_segments.map((s) => s.segment_id)));
  };

  const deselectAllSegments = () => {
    setSelectedSegmentIds(new Set());
  };

  const handleApplySelected = () => {
    if (!analysisData?.improved_segments) return;
    const selected = analysisData.improved_segments.filter((s) =>
      selectedSegmentIds.has(s.segment_id)
    );
    if (selected.length === 0) return;
    onApplyImprovements(selected, updateVisualPrompts);
  };

  const getScoreColor = (score: number) => {
    if (score >= 88) return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
    if (score >= 75) return "text-amber-400 border-amber-500/30 bg-amber-500/10";
    return "text-rose-400 border-rose-500/30 bg-rose-500/10";
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 88) return "bg-emerald-500";
    if (score >= 75) return "bg-amber-500";
    return "bg-rose-500";
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-[#26251F]/70 p-4 backdrop-blur-sm duration-200 sm:p-6">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#E5E1D7] bg-[#FBFAF7] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E9C9BD] bg-[#F8EEEA] shadow-inner">
            <Award className="h-5 w-5 text-[#A9472C]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-base font-semibold tracking-wide text-[#26251F]">
                  Analisis Skor Narasi YouTube
                </h3>
                <span className="rounded-full border border-[#E9C9BD] bg-[#F8EEEA] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#A9472C]">
                  High Retention & AVD
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[#77766D]">
                Evaluasi komprehensif naskah video untuk memaksimalkan retensi penonton YouTube.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#77766D] transition hover:bg-[#F1EEE6] hover:text-[#26251F]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E5E1D7] bg-[#F3F0E8] p-3.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-[#4D4A42]">Fokus Analisis:</span>
              <div className="flex items-center gap-1.5 rounded-lg border border-[#E5E1D7] bg-[#FBFAF7] p-1">
                <button
                  type="button"
                  onClick={() => setFocusAspect("youtube_retention")}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                    focusAspect === "youtube_retention"
                      ? "bg-[#C45B3A] text-white shadow-sm"
                      : "text-[#77766D] hover:text-[#26251F]"
                  }`}
                >
                  ⚡ Retensi & Pacing
                </button>
                <button
                  type="button"
                  onClick={() => setFocusAspect("viral_hook")}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                    focusAspect === "viral_hook"
                      ? "bg-[#C45B3A] text-white shadow-sm"
                      : "text-[#77766D] hover:text-[#26251F]"
                  }`}
                >
                  🎯 Hook Detik 0-30
                </button>
                <button
                  type="button"
                  onClick={() => setFocusAspect("documentary_depth")}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                    focusAspect === "documentary_depth"
                      ? "bg-[#C45B3A] text-white shadow-sm"
                      : "text-[#77766D] hover:text-[#26251F]"
                  }`}
                >
                  🎭 Dramaturgi & Cerita
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCustomInput(!showCustomInput)}
                className="rounded px-2 py-1 text-xs font-medium text-[#A9472C] transition hover:bg-[#F8EEEA] hover:text-[#863A26]"
              >
                {showCustomInput ? "Tutup Catatan" : "+ Catatan Khusus"}
              </button>
              <Button
                size="sm"
                onClick={() => onAnalyze(focusAspect, customInstructions)}
                disabled={isLoading}
                variant="workspace-primary"
                className="h-9 gap-1.5 text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                <span>
                  {isLoading
                    ? "Menganalisis..."
                    : analysisData
                      ? "Analisis Ulang"
                      : "Mulai Analisis"}
                </span>
              </Button>
            </div>
          </div>

          {showCustomInput && (
            <div className="animate-in space-y-1.5 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3 fade-in">
              <label className="text-[11px] font-semibold text-[#4D4A42]">
                Instruksi Khusus Analisis (Opsional):
              </label>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="Contoh: Evaluasi khusus apakah hook pembuka cukup memancing rasa ingin tahu penonton muda, dan cek apakah ada kata yang sulit dibaca TTS..."
                rows={2}
                className="w-full rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-3 py-2 font-sans text-xs leading-relaxed text-[#26251F] focus:border-[#C45B3A] focus:outline-none"
              />
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="py-16 text-center space-y-3">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-[#C45B3A] border-t-transparent" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[#26251F]">
                  Sedang Mengevaluasi Naskah Narasi...
                </p>
                <p className="mx-auto max-w-md text-xs text-[#77766D]">
                  AI sedang menganalisis ritme detik 0–30, variasi kalimat, taruhan emosi, dan
                  menyusun saran perbaikan naskah.
                </p>
              </div>
            </div>
          )}

          {/* Empty / Initial State */}
          {!isLoading && !analysisData && (
            <div className="space-y-3 rounded-2xl border border-dashed border-[#D2CDBF] bg-[#F3F0E8] py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[#E9C9BD] bg-[#F8EEEA]">
                <Sparkles className="h-6 w-6 text-[#A9472C]" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[#26251F]">Naskah Siap Dianalisis</p>
                <p className="mx-auto max-w-sm text-xs leading-relaxed text-[#77766D]">
                  Klik tombol <strong>Mulai Analisis</strong> untuk mengetahui skor performa
                  YouTube, kekuatan hook, dan mendapatkan saran perbaikan otomatis per segmen.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => onAnalyze(focusAspect, customInstructions)}
                variant="workspace-primary"
                className="mt-2 h-9 px-4 text-xs"
              >
                Mulai Analisis Naskah
              </Button>
            </div>
          )}

          {/* Analysis Results Display */}
          {!isLoading && analysisData && (
            <div className="space-y-6 animate-in fade-in">
              {/* Overall Score Banner */}
              <div className="flex flex-col items-center justify-between gap-5 rounded-2xl border border-[#E5E1D7] bg-[#F3F0E8] p-5 shadow-sm sm:flex-row">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-20 h-20 rounded-2xl border-2 flex flex-col items-center justify-center shadow-lg shrink-0 ${getScoreColor(
                      analysisData.overall_score
                    )}`}
                  >
                    <span className="text-2xl font-black font-mono leading-none">
                      {analysisData.overall_score}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider mt-1 opacity-80">
                      / 100
                    </span>
                  </div>
                  <div className="space-y-1 text-center sm:text-left">
                    <div className="flex items-center justify-center sm:justify-start gap-2">
                      <span className="rounded-full border border-[#E9C9BD] bg-[#F8EEEA] px-2.5 py-0.5 font-mono text-xs font-bold text-[#A9472C]">
                        Grade {analysisData.grade}
                      </span>
                      <span className="text-xs font-semibold text-[#4D4A42]">
                        {analysisData.overall_score >= 85
                          ? "Performa Sangat Tinggi (High Retention Ready)"
                          : analysisData.overall_score >= 75
                            ? "Bagus, Perlu Sedikit Poles"
                            : "Butuh Perbaikan Kritis"}
                      </span>
                    </div>
                    <p className="max-w-xl text-xs leading-relaxed text-[#4D4A42]">
                      {analysisData.summary}
                    </p>
                  </div>
                </div>

                {analysisData.has_improvements && (
                  <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveTab("improvements")}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#C45B3A] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#A9472C]"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Lihat {analysisData.improved_segments.length} Naskah Perbaikan</span>
                    </button>
                    <span className="font-mono text-[10px] text-[#456A4E]">
                      ✨ AI telah menyiapkan versi optimal
                    </span>
                  </div>
                )}
              </div>

              {/* Navigation Tabs (Overview vs Improvements) */}
              <div className="flex items-center gap-2 border-b border-[#E5E1D7] pb-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("overview")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    activeTab === "overview"
                      ? "border border-[#E9C9BD] bg-[#F8EEEA] text-[#A9472C]"
                      : "text-[#77766D] hover:text-[#26251F]"
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Rincian 5 Metrik YouTube</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("improvements")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    activeTab === "improvements"
                      ? "border border-[#C9DDCF] bg-[#ECF3EB] text-[#456A4E]"
                      : "text-[#77766D] hover:text-[#26251F]"
                  }`}
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>Naskah Perbaikan ({analysisData.improved_segments?.length || 0})</span>
                </button>
              </div>

              {/* TAB 1: OVERVIEW METRICS */}
              {activeTab === "overview" && (
                <div className="space-y-6">
                  {/* 5 Key Dimension Score Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {/* Dimension 1: Hook */}
                    <div className="space-y-2 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-[#26251F]">
                          <Zap className="w-3.5 h-3.5 text-amber-400" />
                          <span>{analysisData.hook_score.label}</span>
                        </span>
                        <span className="text-xs font-bold font-mono text-amber-400">
                          {analysisData.hook_score.score}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E5E1D7]">
                        <div
                          className={`h-full rounded-full ${getScoreBarColor(analysisData.hook_score.score)}`}
                          style={{ width: `${analysisData.hook_score.score}%` }}
                        />
                      </div>
                      <p className="text-[11px] leading-relaxed text-[#77766D]">
                        {analysisData.hook_score.feedback}
                      </p>
                    </div>

                    {/* Dimension 2: Pacing & Retention */}
                    <div className="space-y-2 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-[#26251F]">
                          <TrendingUp className="w-3.5 h-3.5 text-violet-400" />
                          <span>{analysisData.retention_pacing_score.label}</span>
                        </span>
                        <span className="text-xs font-bold font-mono text-violet-400">
                          {analysisData.retention_pacing_score.score}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E5E1D7]">
                        <div
                          className={`h-full rounded-full ${getScoreBarColor(
                            analysisData.retention_pacing_score.score
                          )}`}
                          style={{ width: `${analysisData.retention_pacing_score.score}%` }}
                        />
                      </div>
                      <p className="text-[11px] leading-relaxed text-[#77766D]">
                        {analysisData.retention_pacing_score.feedback}
                      </p>
                    </div>

                    {/* Dimension 3: Emotional Dramaturgy */}
                    <div className="space-y-2 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-[#26251F]">
                          <Flag className="w-3.5 h-3.5 text-rose-400" />
                          <span>{analysisData.emotional_storytelling_score.label}</span>
                        </span>
                        <span className="text-xs font-bold font-mono text-rose-400">
                          {analysisData.emotional_storytelling_score.score}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E5E1D7]">
                        <div
                          className={`h-full rounded-full ${getScoreBarColor(
                            analysisData.emotional_storytelling_score.score
                          )}`}
                          style={{ width: `${analysisData.emotional_storytelling_score.score}%` }}
                        />
                      </div>
                      <p className="text-[11px] leading-relaxed text-[#77766D]">
                        {analysisData.emotional_storytelling_score.feedback}
                      </p>
                    </div>

                    {/* Dimension 4: Spoken Clarity TTS */}
                    <div className="space-y-2 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-[#26251F]">
                          <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                          <span>{analysisData.clarity_delivery_score.label}</span>
                        </span>
                        <span className="text-xs font-bold font-mono text-sky-400">
                          {analysisData.clarity_delivery_score.score}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E5E1D7]">
                        <div
                          className={`h-full rounded-full ${getScoreBarColor(
                            analysisData.clarity_delivery_score.score
                          )}`}
                          style={{ width: `${analysisData.clarity_delivery_score.score}%` }}
                        />
                      </div>
                      <p className="text-[11px] leading-relaxed text-[#77766D]">
                        {analysisData.clarity_delivery_score.feedback}
                      </p>
                    </div>

                    {/* Dimension 5: Resolution & Payoff */}
                    <div className="space-y-2 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-[#26251F]">
                          <Award className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{analysisData.call_to_action_score.label}</span>
                        </span>
                        <span className="text-xs font-bold font-mono text-emerald-400">
                          {analysisData.call_to_action_score.score}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E5E1D7]">
                        <div
                          className={`h-full rounded-full ${getScoreBarColor(
                            analysisData.call_to_action_score.score
                          )}`}
                          style={{ width: `${analysisData.call_to_action_score.score}%` }}
                        />
                      </div>
                      <p className="text-[11px] leading-relaxed text-[#77766D]">
                        {analysisData.call_to_action_score.feedback}
                      </p>
                    </div>
                  </div>

                  {/* Strengths & Weaknesses 2-Column Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Strengths */}
                    <div className="space-y-2.5 rounded-xl border border-[#C9DDCF] bg-[#ECF3EB] p-4">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#456A4E]">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Kelebihan Naskah Saat Ini</span>
                      </div>
                      <ul className="space-y-1.5">
                        {analysisData.strengths.map((str, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs text-[#4D4A42]">
                            <span className="text-emerald-400 font-bold">•</span>
                            <span>{str}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Weaknesses */}
                    <div className="space-y-2.5 rounded-xl border border-[#EAD8B5] bg-[#F8F1E2] p-4">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#87632C]">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span>Catatan Kritis & Titik Lemah</span>
                      </div>
                      <ul className="space-y-1.5">
                        {analysisData.weaknesses.map((wk, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs text-[#4D4A42]">
                            <span className="text-amber-400 font-bold">•</span>
                            <span>{wk}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Actionable Recommendations */}
                  {analysisData.actionable_recommendations.length > 0 && (
                    <div className="space-y-2.5 rounded-xl border border-[#E9C9BD] bg-[#F8EEEA] p-4">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#A9472C]">
                        <Lightbulb className="h-4 w-4 text-[#A9472C]" />
                        <span>Saran Peningkatan YouTube High Retention</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {analysisData.actionable_recommendations.map((rec, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2 rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] p-2.5 text-xs text-[#4D4A42]"
                          >
                            <span className="text-sky-400 font-bold font-mono">{idx + 1}.</span>
                            <span>{rec}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: IMPROVEMENTS COMPARISON */}
              {activeTab === "improvements" && (
                <div className="space-y-4">
                  {/* Visual Prompt Sync Toggle */}
                  <div className="flex items-start justify-between gap-3 rounded-xl border border-[#E9C9BD] bg-[#F8EEEA] p-3.5 sm:items-center">
                    <label className="flex items-start sm:items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={updateVisualPrompts}
                        onChange={(e) => setUpdateVisualPrompts(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-[#D2CDBF] text-[#C45B3A] focus:ring-0 sm:mt-0"
                      />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1.5 text-xs font-bold text-[#A9472C]">
                            <ImageIcon className="h-3.5 w-3.5 text-[#A9472C]" />
                            Sinkronkan Visual Prompt AI Otomatis
                          </span>
                          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            Direkomendasikan
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-[#5E5C54]">
                          Memperbarui prompt gambar adegan agar selaras dengan narasi baru dan tetap
                          mengunci Story Continuity Bible ([char:...], [loc:...]).
                        </p>
                      </div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-[#E5E1D7] bg-[#F3F0E8] p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#26251F]">
                        Pilih Segmen yang Ingin Diterapkan:
                      </span>
                      <span className="font-mono text-xs text-[#456A4E]">
                        ({selectedSegmentIds.size} dari {analysisData.improved_segments.length}{" "}
                        dipilih)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={selectAllSegments}
                        className="rounded border border-[#E5E1D7] bg-[#FFFEFA] px-2 py-0.5 text-[11px] text-[#77766D] hover:bg-[#F1EEE6] hover:text-[#26251F]"
                      >
                        Pilih Semua
                      </button>
                      <button
                        type="button"
                        onClick={deselectAllSegments}
                        className="rounded border border-[#E5E1D7] bg-[#FFFEFA] px-2 py-0.5 text-[11px] text-[#77766D] hover:bg-[#F1EEE6] hover:text-[#26251F]"
                      >
                        Batal Semua
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[460px] overflow-y-auto custom-scrollbar pr-1">
                    {analysisData.improved_segments.map((seg, idx) => {
                      const isSelected = selectedSegmentIds.has(seg.segment_id);
                      const isDetailOpen = showPromptDetails[seg.segment_id];
                      return (
                        <div
                          key={idx}
                          className={`space-y-2.5 rounded-xl border p-4 transition ${
                            isSelected
                              ? "bg-[#ECF3EB] border-[#C9DDCF] shadow-sm"
                              : "bg-[#FBFAF7] border-[#E5E1D7] opacity-75"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSegmentSelection(seg.segment_id)}
                                className="h-4 w-4 rounded border-[#D2CDBF] text-[#76816B] focus:ring-0"
                              />
                              <span className="text-xs font-semibold text-[#26251F]">
                                {seg.chapter_title || `Segmen ${seg.segment_index + 1}`}
                              </span>
                              <span className="rounded border border-[#E5E1D7] bg-[#F3F0E8] px-1.5 py-0.5 font-mono text-[10px] text-[#77766D]">
                                {seg.segment_id}
                              </span>
                            </label>
                            {seg.change_summary && (
                              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                                ✨ {seg.change_summary}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            <div className="space-y-1 rounded-lg border border-[#E5E1D7] bg-[#F3F0E8] p-3">
                              <span className="text-[10px] uppercase font-bold text-rose-400 block tracking-wider">
                                ❌ Teks Narasi Asli
                              </span>
                              <p className="font-sans leading-relaxed text-[#4D4A42]">
                                {seg.original_text || "(Tidak ada teks)"}
                              </p>
                            </div>

                            <div className="space-y-1 rounded-lg border border-[#C9DDCF] bg-[#ECF3EB] p-3">
                              <span className="text-[10px] uppercase font-bold text-emerald-400 block tracking-wider flex items-center gap-1">
                                <Check className="w-3 h-3" />
                                <span>Versi Optimal (High Retention)</span>
                              </span>
                              <p className="font-sans font-medium leading-relaxed text-[#385440]">
                                {seg.improved_text}
                              </p>
                            </div>
                          </div>

                          {/* Visual Prompt Synchronization Preview */}
                          {seg.improved_visual_prompt && (
                            <div className="space-y-1.5 border-t border-[#E5E1D7] pt-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-violet-300 flex items-center gap-1.5">
                                  <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
                                  <span>
                                    Visual Prompt AI Adegan (
                                    {updateVisualPrompts ? "Akan Disinkronkan" : "Dilewati"})
                                  </span>
                                </span>
                                {seg.original_visual_prompt && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setShowPromptDetails((prev) => ({
                                        ...prev,
                                        [seg.segment_id]: !prev[seg.segment_id],
                                      }))
                                    }
                                    className="flex items-center gap-1 text-[10px] text-[#77766D] transition hover:text-[#26251F]"
                                  >
                                    <span>
                                      {isDetailOpen
                                        ? "Sembunyikan Prompt Asli"
                                        : "Lihat Prompt Asli"}
                                    </span>
                                    {isDetailOpen ? (
                                      <ChevronUp className="w-3 h-3" />
                                    ) : (
                                      <ChevronDown className="w-3 h-3" />
                                    )}
                                  </button>
                                )}
                              </div>

                              {isDetailOpen && seg.original_visual_prompt && (
                                <div className="rounded-lg border border-[#E5E1D7] bg-[#F3F0E8] p-2.5 font-mono text-[11px] leading-relaxed text-[#4D4A42]">
                                  <span className="mb-0.5 block text-[9px] font-bold uppercase text-[#77766D]">
                                    Prompt Visual Asli:
                                  </span>
                                  {seg.original_visual_prompt}
                                </div>
                              )}

                              <div className="rounded-lg border border-[#E9C9BD] bg-[#F8EEEA] p-2.5 font-mono text-[11px] leading-relaxed text-[#4D4A42]">
                                <span className="mb-0.5 flex items-center gap-1 text-[9px] font-bold uppercase text-[#A9472C]">
                                  ✨ Prompt Visual Selaras Naskah (Continuity Anchored):
                                </span>
                                {seg.improved_visual_prompt}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-[#E5E1D7] bg-[#F3F0E8] px-6 py-3.5">
          <div className="text-xs text-[#77766D]">
            {analysisData && (
              <span>
                Skor Naskah:{" "}
                <strong className="text-[#26251F]">{analysisData.overall_score}/100</strong> (Grade{" "}
                {analysisData.grade})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={onClose}
              variant="workspace-secondary"
              className="h-9 text-xs"
            >
              Tutup
            </Button>

            {analysisData?.has_improvements && (
              <Button
                size="sm"
                onClick={handleApplySelected}
                disabled={isApplying || selectedSegmentIds.size === 0}
                variant="workspace-primary"
                className="h-9 gap-1.5 text-xs"
              >
                {isApplying ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>
                  {isApplying
                    ? "Menerapkan Perbaikan..."
                    : `Terapkan Perbaikan (${selectedSegmentIds.size} Segmen)`}
                </span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
