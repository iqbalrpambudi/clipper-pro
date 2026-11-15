import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Cpu, FileText, Sliders } from "lucide-react";
import { FilterPills } from "@/components/ui";
import { WorkspaceShell } from "@/components/layout";
import { ModelsConfigTab } from "@/features/settings/ModelsConfigTab";
import { PromptTemplatesTab } from "@/features/settings/PromptTemplatesTab";
import { ProjectDefaultsTab } from "@/features/settings/ProjectDefaultsTab";

type SettingsTabId = "models" | "prompts" | "defaults";

function parseTabParam(value: string | null): SettingsTabId {
  if (value === "prompts" || value === "defaults") return value;
  return "models";
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabId>(() =>
    parseTabParam(searchParams.get("tab"))
  );

  useEffect(() => {
    const paramTab = parseTabParam(searchParams.get("tab"));
    if (searchParams.get("tab")) {
      setActiveSettingsTab(paramTab);
    }
  }, [searchParams]);

  const handleTabChange = (nextTab: SettingsTabId) => {
    setActiveSettingsTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === "models") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", nextTab);
    }
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <WorkspaceShell activePage="settings">
      <div className="workspace-settings">
        <header className="workspace-settings-intro">
          <p className="workspace-page-eyebrow">Preferensi workspace</p>
          <h1 className="workspace-page-title">Pengaturan &amp; preset</h1>
          <p className="workspace-page-description">
            Atur model AI, API key, gaya naskah, dan default config.json untuk project baru Anda.
          </p>
        </header>

        <FilterPills
          value={activeSettingsTab}
          onChange={handleTabChange}
          items={[
            { id: "models", label: "Model AI & API Keys", icon: Cpu },
            { id: "prompts", label: "Prompt AI & Preset Naskah", icon: FileText },
            { id: "defaults", label: "Default Project (config.json)", icon: Sliders },
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
          {activeSettingsTab === "defaults" && <ProjectDefaultsTab />}
        </section>
      </div>
    </WorkspaceShell>
  );
}
