"use client";

import React, { useState } from "react";
import { Cpu, FileText } from "lucide-react";
import { FilterPills } from "@/components/ui";
import { WorkspaceShell } from "@/components/layout";
import { ModelsConfigTab } from "./_components/ModelsConfigTab";
import { PromptTemplatesTab } from "./_components/PromptTemplatesTab";

export default function SettingsPage() {
  const [activeSettingsTab, setActiveSettingsTab] = useState<"models" | "prompts">("models");

  return (
    <WorkspaceShell activePage="settings">
      <div className="workspace-settings">
        <header className="workspace-settings-intro">
          <p className="workspace-page-eyebrow">Preferensi workspace</p>
          <h1 className="workspace-page-title">Pengaturan &amp; preset</h1>
          <p className="workspace-page-description">
            Atur model AI, API key, dan gaya naskah untuk proses produksi Anda.
          </p>
        </header>

        <FilterPills
          value={activeSettingsTab}
          onChange={setActiveSettingsTab}
          items={[
            { id: "models", label: "Model AI & API Keys", icon: Cpu },
            { id: "prompts", label: "Prompt AI & Preset Naskah", icon: FileText },
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
        </section>
      </div>
    </WorkspaceShell>
  );
}
