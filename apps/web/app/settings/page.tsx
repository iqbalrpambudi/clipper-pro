"use client";

import React, { useState } from "react";
import { Cpu, FileText, Palette } from "lucide-react";
import { FilterPills } from "@/components/ui";
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

        <FilterPills
          value={activeSettingsTab}
          onChange={setActiveSettingsTab}
          items={[
            { id: "models", label: "Model AI & API Keys", icon: Cpu },
            { id: "prompts", label: "Prompt AI & Preset Naskah", icon: FileText },
            { id: "subtitles", label: "Preset Gaya Subtitle", icon: Palette },
          ]}
        />

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
