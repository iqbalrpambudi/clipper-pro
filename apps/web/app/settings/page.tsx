"use client";

import React, { useState } from "react";
import { Cpu, FileText, Palette } from "lucide-react";
import { WorkspaceShell } from "@/components/layout";
import { ModelsConfigTab } from "./_components/ModelsConfigTab";
import { PromptTemplatesTab } from "./_components/PromptTemplatesTab";
import { SubtitlePresetsTab } from "./_components/SubtitlePresetsTab";

export default function SettingsPage() {
  const [activeSettingsTab, setActiveSettingsTab] = useState<"models" | "prompts" | "subtitles">(
    "models"
  );

  return (
    <WorkspaceShell activePage="settings">
      <div className="workspace-settings">
        <header className="workspace-settings-intro">
          <p className="workspace-page-eyebrow">Preferensi workspace</p>
          <h1 className="workspace-page-title">Pengaturan &amp; preset</h1>
          <p className="workspace-page-description">
            Atur model AI, gaya naskah, dan tampilan subtitle untuk proses produksi Anda.
          </p>
        </header>

        <div className="workspace-settings-tabs" role="tablist" aria-label="Kategori pengaturan">
          <button
            type="button"
            role="tab"
            id="settings-tab-models"
            aria-controls="settings-panel-models"
            aria-selected={activeSettingsTab === "models"}
            onClick={() => setActiveSettingsTab("models")}
            className={`workspace-settings-tab ${activeSettingsTab === "models" ? "is-active" : ""}`}
          >
            <Cpu aria-hidden="true" />
            Model AI &amp; API Keys
          </button>
          <button
            type="button"
            role="tab"
            id="settings-tab-prompts"
            aria-controls="settings-panel-prompts"
            aria-selected={activeSettingsTab === "prompts"}
            onClick={() => setActiveSettingsTab("prompts")}
            className={`workspace-settings-tab ${activeSettingsTab === "prompts" ? "is-active" : ""}`}
          >
            <FileText aria-hidden="true" />
            Prompt AI &amp; Preset Naskah
          </button>
          <button
            type="button"
            role="tab"
            id="settings-tab-subtitles"
            aria-controls="settings-panel-subtitles"
            aria-selected={activeSettingsTab === "subtitles"}
            onClick={() => setActiveSettingsTab("subtitles")}
            className={`workspace-settings-tab ${activeSettingsTab === "subtitles" ? "is-active" : ""}`}
          >
            <Palette aria-hidden="true" />
            Preset Gaya Subtitle
          </button>
        </div>

        <section
          role="tabpanel"
          id={`settings-panel-${activeSettingsTab}`}
          aria-labelledby={`settings-tab-${activeSettingsTab}`}
          className="workspace-settings-panel"
        >
          {activeSettingsTab === "models" && <ModelsConfigTab />}
          {activeSettingsTab === "prompts" && <PromptTemplatesTab />}
          {activeSettingsTab === "subtitles" && <SubtitlePresetsTab />}
        </section>
      </div>
    </WorkspaceShell>
  );
}
