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
import {
  StoryboardNarrationAnalysisResponse,
  NarrationSegmentImprovement,
} from "@/types";
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
    const selected = analysisData.improved_segments.filter((s) => selectedSegmentIds.has(s.segment_id));
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-[#141414] border border-[#2A2A2A] rounded-2xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#242424] bg-[#181818]/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 via-violet-500/20 to-sky-500/20 border border-amber-500/30 flex items-center justify-center shadow-inner">
              <Award className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Analisis Skor Narasi YouTube
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  High Retention & AVD
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Evaluasi komprehensif naskah video untuk memaksimalkan retensi penonton YouTube.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          {/* Controls Bar */}
          <div className="p-3.5 rounded-xl bg-[#1A1A1A] border border-[#2B2B2B] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-300">Fokus Analisis:</span>
              <div className="flex items-center gap-1.5 bg-[#121212] p-1 rounded-lg border border-[#2D2D2D]">
                <button
                  type="button"
                  onClick={() => setFocusAspect("youtube_retention")}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                    focusAspect === "youtube_retention"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  ⚡ Retensi & Pacing
                </button>
                <button
                  type="button"
                  onClick={() => setFocusAspect("viral_hook")}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                    focusAspect === "viral_hook"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  🎯 Hook Detik 0-30
                </button>
                <button
                  type="button"
                  onClick={() => setFocusAspect("documentary_depth")}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                    focusAspect === "documentary_depth"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
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
                className="text-xs text-sky-400 hover:text-sky-300 font-medium transition px-2 py-1 rounded hover:bg-sky-500/10"
              >
                {showCustomInput ? "Tutup Catatan" : "+ Catatan Khusus"}
              </button>
              <Button
                size="sm"
                onClick={() => onAnalyze(focusAspect, customInstructions)}
                disabled={isLoading}
                className="h-8 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold gap-1.5 shadow-md shadow-violet-600/20"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                <span>{isLoading ? "Menganalisis..." : analysisData ? "Analisis Ulang" : "Mulai Analisis"}</span>
              </Button>
            </div>
          </div>

          {showCustomInput && (
            <div className="p-3 rounded-xl bg-[#181818] border border-[#2D2D2D] space-y-1.5 animate-in fade-in">
              <label className="text-[11px] font-semibold text-slate-300">
                Instruksi Khusus Analisis (Opsional):
              </label>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="Contoh: Evaluasi khusus apakah hook pembuka cukup memancing rasa ingin tahu penonton muda, dan cek apakah ada kata yang sulit dibaca TTS..."
                rows={2}
                className="w-full px-3 py-2 bg-[#121212] rounded-lg border border-[#333] text-xs text-slate-200 focus:outline-none focus:border-violet-500 leading-relaxed font-sans"
              />
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white">Sedang Mengevaluasi Naskah Narasi...</p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  AI sedang menganalisis ritme detik 0–30, variasi kalimat, taruhan emosi, dan menyusun saran perbaikan naskah.
                </p>
              </div>
            </div>
          )}

          {/* Empty / Initial State */}
          {!isLoading && !analysisData && (
            <div className="py-16 text-center space-y-3 border border-dashed border-[#2A2A2A] rounded-2xl bg-[#161616]">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-violet-400" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-white">Naskah Siap Dianalisis</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Klik tombol <strong>Mulai Analisis</strong> untuk mengetahui skor performa YouTube, kekuatan hook, dan mendapatkan saran perbaikan otomatis per segmen.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => onAnalyze(focusAspect, customInstructions)}
                className="mt-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold px-4 h-8"
              >
                Mulai Analisis Naskah
              </Button>
            </div>
          )}

          {/* Analysis Results Display */}
          {!isLoading && analysisData && (
            <div className="space-y-6 animate-in fade-in">
              {/* Overall Score Banner */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-[#1A1625] via-[#161726] to-[#141A22] border border-violet-500/20 flex flex-col sm:flex-row items-center justify-between gap-5 shadow-lg">
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
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30 font-mono">
                        Grade {analysisData.grade}
                      </span>
                      <span className="text-xs font-semibold text-slate-300">
                        {analysisData.overall_score >= 85
                          ? "Performa Sangat Tinggi (High Retention Ready)"
                          : analysisData.overall_score >= 75
                          ? "Bagus, Perlu Sedikit Poles"
                          : "Butuh Perbaikan Kritis"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
                      {analysisData.summary}
                    </p>
                  </div>
                </div>

                {analysisData.has_improvements && (
                  <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveTab("improvements")}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition shadow-lg shadow-emerald-600/20"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Lihat {analysisData.improved_segments.length} Naskah Perbaikan</span>
                    </button>
                    <span className="text-[10px] text-emerald-400 font-mono">
                      ✨ AI telah menyiapkan versi optimal
                    </span>
                  </div>
                )}
              </div>

              {/* Navigation Tabs (Overview vs Improvements) */}
              <div className="flex items-center gap-2 border-b border-[#262626] pb-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("overview")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    activeTab === "overview"
                      ? "bg-white/10 text-white border border-white/20"
                      : "text-slate-400 hover:text-white"
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
                      ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/30"
                      : "text-slate-400 hover:text-white"
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
                    <div className="p-3.5 rounded-xl bg-[#171717] border border-[#262626] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-amber-400" />
                          <span>{analysisData.hook_score.label}</span>
                        </span>
                        <span className="text-xs font-bold font-mono text-amber-400">
                          {analysisData.hook_score.score}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-black/40 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${getScoreBarColor(analysisData.hook_score.score)}`}
                          style={{ width: `${analysisData.hook_score.score}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {analysisData.hook_score.feedback}
                      </p>
                    </div>

                    {/* Dimension 2: Pacing & Retention */}
                    <div className="p-3.5 rounded-xl bg-[#171717] border border-[#262626] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5 text-violet-400" />
                          <span>{analysisData.retention_pacing_score.label}</span>
                        </span>
                        <span className="text-xs font-bold font-mono text-violet-400">
                          {analysisData.retention_pacing_score.score}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-black/40 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${getScoreBarColor(
                            analysisData.retention_pacing_score.score
                          )}`}
                          style={{ width: `${analysisData.retention_pacing_score.score}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {analysisData.retention_pacing_score.feedback}
                      </p>
                    </div>

                    {/* Dimension 3: Emotional Dramaturgy */}
                    <div className="p-3.5 rounded-xl bg-[#171717] border border-[#262626] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Flag className="w-3.5 h-3.5 text-rose-400" />
                          <span>{analysisData.emotional_storytelling_score.label}</span>
                        </span>
                        <span className="text-xs font-bold font-mono text-rose-400">
                          {analysisData.emotional_storytelling_score.score}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-black/40 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${getScoreBarColor(
                            analysisData.emotional_storytelling_score.score
                          )}`}
                          style={{ width: `${analysisData.emotional_storytelling_score.score}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {analysisData.emotional_storytelling_score.feedback}
                      </p>
                    </div>

                    {/* Dimension 4: Spoken Clarity TTS */}
                    <div className="p-3.5 rounded-xl bg-[#171717] border border-[#262626] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                          <span>{analysisData.clarity_delivery_score.label}</span>
                        </span>
                        <span className="text-xs font-bold font-mono text-sky-400">
                          {analysisData.clarity_delivery_score.score}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-black/40 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${getScoreBarColor(
                            analysisData.clarity_delivery_score.score
                          )}`}
                          style={{ width: `${analysisData.clarity_delivery_score.score}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {analysisData.clarity_delivery_score.feedback}
                      </p>
                    </div>

                    {/* Dimension 5: Resolution & Payoff */}
                    <div className="p-3.5 rounded-xl bg-[#171717] border border-[#262626] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Award className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{analysisData.call_to_action_score.label}</span>
                        </span>
                        <span className="text-xs font-bold font-mono text-emerald-400">
                          {analysisData.call_to_action_score.score}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-black/40 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${getScoreBarColor(
                            analysisData.call_to_action_score.score
                          )}`}
                          style={{ width: `${analysisData.call_to_action_score.score}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {analysisData.call_to_action_score.feedback}
                      </p>
                    </div>
                  </div>

                  {/* Strengths & Weaknesses 2-Column Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Strengths */}
                    <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/20 space-y-2.5">
                      <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs uppercase tracking-wider">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Kelebihan Naskah Saat Ini</span>
                      </div>
                      <ul className="space-y-1.5">
                        {analysisData.strengths.map((str, idx) => (
                          <li key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                            <span className="text-emerald-400 font-bold">•</span>
                            <span>{str}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Weaknesses */}
                    <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/20 space-y-2.5">
                      <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span>Catatan Kritis & Titik Lemah</span>
                      </div>
                      <ul className="space-y-1.5">
                        {analysisData.weaknesses.map((wk, idx) => (
                          <li key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                            <span className="text-amber-400 font-bold">•</span>
                            <span>{wk}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Actionable Recommendations */}
                  {analysisData.actionable_recommendations.length > 0 && (
                    <div className="p-4 rounded-xl bg-sky-950/20 border border-sky-500/20 space-y-2.5">
                      <div className="flex items-center gap-2 text-sky-300 font-bold text-xs uppercase tracking-wider">
                        <Lightbulb className="w-4 h-4 text-sky-400" />
                        <span>Saran Peningkatan YouTube High Retention</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {analysisData.actionable_recommendations.map((rec, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg bg-black/30 border border-[#262626] text-xs text-slate-200 flex items-start gap-2"
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
                  <div className="flex items-start sm:items-center justify-between p-3.5 rounded-xl bg-violet-950/20 border border-violet-500/30 gap-3">
                    <label className="flex items-start sm:items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={updateVisualPrompts}
                        onChange={(e) => setUpdateVisualPrompts(e.target.checked)}
                        className="w-4 h-4 mt-0.5 sm:mt-0 rounded text-violet-500 focus:ring-0 bg-[#222] border-[#444]"
                      />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-violet-200 flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
                            Sinkronkan Visual Prompt AI Otomatis
                          </span>
                          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            Direkomendasikan
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Memperbarui prompt gambar adegan agar selaras dengan narasi baru dan tetap mengunci Story Continuity Bible ([char:...], [loc:...]).
                        </p>
                      </div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between bg-[#181818] p-3 rounded-xl border border-[#262626]">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">
                        Pilih Segmen yang Ingin Diterapkan:
                      </span>
                      <span className="text-xs font-mono text-emerald-400">
                        ({selectedSegmentIds.size} dari {analysisData.improved_segments.length} dipilih)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={selectAllSegments}
                        className="text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-black/30 border border-[#333]"
                      >
                        Pilih Semua
                      </button>
                      <button
                        type="button"
                        onClick={deselectAllSegments}
                        className="text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-black/30 border border-[#333]"
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
                          className={`p-4 rounded-xl border transition space-y-2.5 ${
                            isSelected
                              ? "bg-[#181818] border-emerald-500/40 shadow-sm"
                              : "bg-[#141414] border-[#262626] opacity-70"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSegmentSelection(seg.segment_id)}
                                className="w-4 h-4 rounded text-emerald-600 focus:ring-0 bg-[#222] border-[#444]"
                              />
                              <span className="text-xs font-bold text-white">
                                {seg.chapter_title || `Segmen ${seg.segment_index + 1}`}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-black/40 border border-[#333]">
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
                            <div className="p-3 rounded-lg bg-black/40 border border-[#222] space-y-1">
                              <span className="text-[10px] uppercase font-bold text-rose-400 block tracking-wider">
                                ❌ Teks Narasi Asli
                              </span>
                              <p className="text-slate-300 leading-relaxed font-sans">
                                {seg.original_text || "(Tidak ada teks)"}
                              </p>
                            </div>

                            <div className="p-3 rounded-lg bg-emerald-950/15 border border-emerald-500/20 space-y-1">
                              <span className="text-[10px] uppercase font-bold text-emerald-400 block tracking-wider flex items-center gap-1">
                                <Check className="w-3 h-3" />
                                <span>Versi Optimal (High Retention)</span>
                              </span>
                              <p className="text-emerald-100 font-medium leading-relaxed font-sans">
                                {seg.improved_text}
                              </p>
                            </div>
                          </div>

                          {/* Visual Prompt Synchronization Preview */}
                          {seg.improved_visual_prompt && (
                            <div className="pt-2 border-t border-[#262626] space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-violet-300 flex items-center gap-1.5">
                                  <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
                                  <span>Visual Prompt AI Adegan ({updateVisualPrompts ? "Akan Disinkronkan" : "Dilewati"})</span>
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
                                    className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 transition"
                                  >
                                    <span>{isDetailOpen ? "Sembunyikan Prompt Asli" : "Lihat Prompt Asli"}</span>
                                    {isDetailOpen ? (
                                      <ChevronUp className="w-3 h-3" />
                                    ) : (
                                      <ChevronDown className="w-3 h-3" />
                                    )}
                                  </button>
                                )}
                              </div>

                              {isDetailOpen && seg.original_visual_prompt && (
                                <div className="p-2.5 rounded-lg bg-black/40 border border-[#222] text-[11px] text-slate-400 font-mono leading-relaxed">
                                  <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Prompt Visual Asli:</span>
                                  {seg.original_visual_prompt}
                                </div>
                              )}

                              <div className="p-2.5 rounded-lg bg-violet-950/20 border border-violet-500/25 text-[11px] text-violet-100 font-mono leading-relaxed">
                                <span className="text-[9px] uppercase font-bold text-violet-400 block mb-0.5 flex items-center gap-1">
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
        <div className="px-6 py-3.5 border-t border-[#242424] bg-[#161616] flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {analysisData && (
              <span>
                Skor Naskah: <strong className="text-white">{analysisData.overall_score}/100</strong> (Grade {analysisData.grade})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-8 text-xs font-semibold border-[#333] bg-[#202020] hover:bg-[#2A2A2A] text-slate-200"
            >
              Tutup
            </Button>

            {analysisData?.has_improvements && (
              <Button
                size="sm"
                onClick={handleApplySelected}
                disabled={isApplying || selectedSegmentIds.size === 0}
                className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold gap-1.5 shadow-md shadow-emerald-600/20"
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
