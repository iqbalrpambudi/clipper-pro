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
  ChevronRight,
  LucideIcon,
} from "lucide-react";
import { Button, Input, Badge } from "@/components/ui";
import { GlobalTaskIndicator } from "@/components/common/GlobalTaskIndicator";
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
  onRenderClick: _onRenderClick,
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

  return (
    <div className="min-h-screen flex flex-col bg-[#121212] text-foreground">
      {/* ========================================================================= */}
      {/* 1. SUPABASE STUDIO TOP HEADER                                              */}
      {/* ========================================================================= */}
      <header className="border-b border-[#2E2E2E] bg-[#171717]/95 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Left: Breadcrumbs & Inline Title Edit */}
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/">
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-white hover:bg-white/5 h-8 w-8"
                title="Kembali ke Dashboard"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>

            <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0 hidden sm:flex">
              <Link href="/" className="hover:text-foreground transition">
                Projects
              </Link>
              <ChevronRight className="w-3.5 h-3.5 opacity-50" />
            </div>

            {isEditingTitle ? (
              <form onSubmit={handleTitleSubmit} className="flex items-center gap-1.5">
                <Input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setIsEditingTitle(false);
                  }}
                  className="h-7 text-xs font-semibold max-w-xs"
                  autoFocus
                />
                <Button
                  type="submit"
                  variant="supabase"
                  size="icon-sm"
                  disabled={isRenaming}
                  className="h-7 w-7"
                  title="Simpan Nama"
                >
                  {isRenaming ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Check className="w-3 h-3" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setIsEditingTitle(false)}
                  className="h-7 w-7 border-[#2E2E2E]"
                  title="Batal"
                >
                  <X className="w-3 h-3" />
                </Button>
              </form>
            ) : (
              <div className="flex items-center gap-2 group min-w-0">
                <span
                  onClick={() => {
                    setEditTitle(projectName);
                    setIsEditingTitle(true);
                  }}
                  className="text-sm font-semibold text-white tracking-tight truncate max-w-xs sm:max-w-md cursor-pointer hover:text-[#3ECF8E] transition"
                  title="Klik untuk mengubah nama project"
                >
                  {projectName}
                </span>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setEditTitle(projectName);
                    setIsEditingTitle(true);
                  }}
                  className="text-muted-foreground hover:text-[#3ECF8E] opacity-50 group-hover:opacity-100 h-6 w-6"
                  title="Edit Nama Project"
                >
                  <Edit3 className="w-3 h-3" />
                </Button>

                <Badge variant="supabase" className="font-mono text-[10px] py-0 shrink-0">
                  {aspectRatio} • {resolution}
                </Badge>
              </div>
            )}
          </div>

          {/* Right: Studio Utilities & Render CTA */}
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/settings">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs border-[#2E2E2E] h-8"
                title="Model Settings"
              >
                <SettingsIcon className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="hidden md:inline">Settings</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* ======================================================================= */}
        {/* 2. SUPABASE STUDIO SUB-NAVIGATION TABS                                  */}
        {/* ======================================================================= */}
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto border-t border-[#2E2E2E]/60 py-1 no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${isActive
                  ? "bg-[#242424] text-white border-b-2 border-[#3ECF8E] shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-white hover:bg-white/5"
                  }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 ${isActive ? "text-[#3ECF8E]" : "text-muted-foreground"
                    }`}
                />
                <span>{tab.label}</span>
                {tab.badge && (
                  <Badge
                    variant={isActive ? "supabase" : "secondary"}
                    className="text-[9px] px-1.5 py-0 h-4"
                  >
                    {tab.badge}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Real-time Global Worker Task Floating Indicator */}
      <GlobalTaskIndicator projectId={projectId} />

      {/* Main Studio Body Canvas */}
      <main
        className={
          activeTab === "timeline"
            ? "w-full max-w-[1920px] mx-auto flex-1 flex flex-col min-h-0"
            : "max-w-8xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full"
        }
      >
        {children}
      </main>
    </div>
  );
}
