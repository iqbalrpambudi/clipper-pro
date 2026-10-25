"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Settings as SettingsIcon,
  Edit3,
  Check,
  X,
  Loader2,
  Download,
  LucideIcon,
} from "lucide-react";
import { Button, Input, Badge } from "@/components/ui";
import { GlobalTaskIndicator } from "@/components/common/GlobalTaskIndicator";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { StudioTab } from "@/lib/store";

export interface StudioNavTab {
  id: StudioTab;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

export interface StudioLayoutProps {
  projectName: string;
  projectId: string;
  aspectRatio: string;
  resolution: string;
  activeTab: StudioTab;
  onTabChange: (tab: StudioTab) => void;
  tabs: StudioNavTab[];
  onRenameProject?: (newName: string) => Promise<void> | void;
  isRenaming?: boolean;
  onRenderClick?: () => void;
  children: React.ReactNode;
}

export function StudioLayout({
  projectName,
  projectId,
  aspectRatio,
  resolution,
  activeTab,
  onTabChange,
  tabs,
  onRenameProject,
  isRenaming = false,
  onRenderClick,
  children,
}: StudioLayoutProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(projectName);

  const handleTitleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim() || !onRenameProject) return;
    await onRenameProject(editTitle.trim());
    setIsEditingTitle(false);
  };

  const isFullHeightTab =
    activeTab === "timeline" ||
    activeTab === "storyboard_timeline" ||
    activeTab === "storyboard_watermark";

  return (
    <div
      className={`workspace-theme flex flex-col bg-background text-foreground ${
        isFullHeightTab ? "h-screen overflow-hidden" : "min-h-screen"
      }`}
    >
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="mx-auto flex min-h-16 max-w-[1920px] items-center gap-3 px-3 py-2 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Button
              asChild
              variant="workspace-quiet"
              size="icon-sm"
              className="h-9 w-9 shrink-0"
              title="Kembali ke daftar project"
              aria-label="Kembali ke daftar project"
            >
              <Link href="/">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>

            {isEditingTitle ? (
              <form onSubmit={handleTitleSubmit} className="flex min-w-0 items-center gap-1.5">
                <Input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setIsEditingTitle(false);
                  }}
                  aria-label="Nama project"
                  className="h-9 max-w-xs text-sm font-semibold"
                  autoFocus
                />
                <Button
                  type="submit"
                  variant="workspace-primary"
                  size="workspace-icon"
                  disabled={isRenaming}
                  aria-label="Simpan nama project"
                  title="Simpan nama project"
                >
                  {isRenaming ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="workspace-secondary"
                  size="workspace-icon"
                  onClick={() => setIsEditingTitle(false)}
                  aria-label="Batalkan perubahan nama"
                  title="Batal"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </form>
            ) : (
              <div className="group flex min-w-0 items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditTitle(projectName);
                    setIsEditingTitle(true);
                  }}
                  className="max-w-[min(42vw,20rem)] truncate rounded text-left font-serif text-lg text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-md sm:text-xl"
                  title="Ubah nama project"
                >
                  {projectName}
                </button>

                <Button
                  type="button"
                  variant="workspace-quiet"
                  size="icon-sm"
                  onClick={() => {
                    setEditTitle(projectName);
                    setIsEditingTitle(true);
                  }}
                  className="hidden h-8 w-8 shrink-0 sm:inline-flex"
                  aria-label={`Ubah nama project ${projectName}`}
                  title="Ubah nama project"
                >
                  <Edit3 className="h-4 w-4" aria-hidden="true" />
                </Button>

                <Badge
                  variant="workspace"
                  className="hidden shrink-0 font-mono text-[10px] sm:inline-flex"
                >
                  {aspectRatio} · {resolution}
                </Badge>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Badge variant="workspace" className="font-mono text-[10px] sm:hidden">
              {aspectRatio}
            </Badge>
            <ThemeToggle align="end" />
            <Button
              asChild
              variant="workspace-secondary"
              size="workspace-sm"
              className="gap-2 px-2 sm:px-3"
              aria-label="Pengaturan"
              title="Pengaturan"
            >
              <Link href="/settings">
                <SettingsIcon className="h-4 w-4" aria-hidden="true" />
                <span className="hidden md:inline">Pengaturan</span>
              </Link>
            </Button>
            {onRenderClick && (
              <Button
                type="button"
                variant="workspace-primary"
                size="workspace-sm"
                className="gap-2 px-2 sm:px-3"
                onClick={onRenderClick}
                aria-label="Buka tahap render dan ekspor"
                title="Render dan ekspor"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Render</span>
              </Button>
            )}
          </div>
        </div>

        <nav
          aria-label="Tahap project"
          className="project-studio-stage-nav border-t border-border bg-card"
        >
          <div className="mx-auto flex max-w-[1920px] px-3 py-2 sm:px-6 no-scrollbar">
            <div className="workspace-filter-pills flex items-center gap-1.5 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onTabChange(tab.id)}
                    aria-current={isActive ? "step" : undefined}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                      isActive
                        ? "workspace-filter-active"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon
                      className="h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden text-[10px]">{tab.label.replace(/^\d+\.\s*/, "").split(" ")[0]}</span>
                    {tab.badge && (
                      <Badge
                        variant={isActive ? "workspace-accent" : "workspace"}
                        className="px-2 py-0 text-[10px]"
                      >
                        {tab.badge}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
      </header>

      {/* Real-time Global Worker Task Floating Indicator */}
      <GlobalTaskIndicator projectId={projectId} />

      {/* Main Studio Body Canvas */}
      <main
        className={
          isFullHeightTab
            ? "w-full flex-1 flex flex-col min-h-0 overflow-hidden"
            : "w-full flex-1 flex flex-col min-h-0"
        }
      >
        {children}
      </main>
    </div>
  );
}
