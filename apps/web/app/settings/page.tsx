"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Settings as SettingsIcon,
  Cpu,
  FileText,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui";
import { ModelsConfigTab } from "./_components/ModelsConfigTab";
import { PromptTemplatesTab } from "./_components/PromptTemplatesTab";
import { SubtitlePresetsTab } from "./_components/SubtitlePresetsTab";

export default function SettingsPage() {
  const [activeSettingsTab, setActiveSettingsTab] = useState<"models" | "prompts" | "subtitles">(
    "models"
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#121212]">
      {/* Header */}
      <header className="border-b border-[#2E2E2E] bg-[#171717]/95 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-white hover:bg-white/5"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <SettingsIcon className="w-4 h-4 text-[#3ECF8E]" />
                Pengaturan Sistem & Preset
              </h1>
              <p className="text-[11px] text-muted-foreground">
                Model AI, Preset Naskah Prompt & Kustomisasi Gaya Subtitle
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-4xl mx-auto px-6 py-8 flex-1 w-full space-y-6">
        {/* Navigation Tabs */}
        <div className="flex gap-2 border-b border-[#2E2E2E] pb-3 overflow-x-auto custom-scrollbar">
          <button
            type="button"
            onClick={() => setActiveSettingsTab("models")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
              activeSettingsTab === "models"
                ? "bg-[#242424] text-white border-b-2 border-[#3ECF8E] shadow-sm"
                : "text-muted-foreground hover:text-white hover:bg-white/5"
            }`}
          >
            <Cpu
              className={`w-3.5 h-3.5 ${activeSettingsTab === "models" ? "text-[#3ECF8E]" : "text-muted-foreground"}`}
            />
            <span>Model AI & API Keys</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSettingsTab("prompts")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
              activeSettingsTab === "prompts"
                ? "bg-[#242424] text-white border-b-2 border-[#3ECF8E] shadow-sm"
                : "text-muted-foreground hover:text-white hover:bg-white/5"
            }`}
          >
            <FileText
              className={`w-3.5 h-3.5 ${activeSettingsTab === "prompts" ? "text-[#3ECF8E]" : "text-muted-foreground"}`}
            />
            <span>Prompt AI & Preset Naskah</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSettingsTab("subtitles")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
              activeSettingsTab === "subtitles"
                ? "bg-[#242424] text-white border-b-2 border-[#3ECF8E] shadow-sm"
                : "text-muted-foreground hover:text-white hover:bg-white/5"
            }`}
          >
            <Palette
              className={`w-3.5 h-3.5 ${activeSettingsTab === "subtitles" ? "text-[#3ECF8E]" : "text-muted-foreground"}`}
            />
            <span>Preset Gaya Subtitle</span>
          </button>
        </div>

        {/* Tab 1: Models */}
        {activeSettingsTab === "models" && <ModelsConfigTab />}

        {/* Tab 2: Prompts */}
        {activeSettingsTab === "prompts" && <PromptTemplatesTab />}

        {/* Tab 3: Subtitles */}
        {activeSettingsTab === "subtitles" && <SubtitlePresetsTab />}
      </main>
    </div>
  );
}
