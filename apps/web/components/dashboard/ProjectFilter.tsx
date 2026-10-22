"use client";

import React from "react";
import { Film, Image as ImageIcon, Search, X, ArrowUpDown, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui";

export type ProjectModeFilter = "all" | "short_video" | "long_storyboard";
export type ProjectSortOption = "newest" | "oldest" | "name_asc" | "name_desc";

interface ProjectFilterProps {
  modeFilter: ProjectModeFilter;
  onModeFilterChange: (mode: ProjectModeFilter) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  sortOption: ProjectSortOption;
  onSortOptionChange: (option: ProjectSortOption) => void;
  totalCount: number;
  shortCount: number;
  storyboardCount: number;
  filteredCount: number;
  onResetFilters: () => void;
}

export function ProjectFilter({
  modeFilter,
  onModeFilterChange,
  searchQuery,
  onSearchQueryChange,
  sortOption,
  onSortOptionChange,
  totalCount,
  shortCount,
  storyboardCount,
  filteredCount,
  onResetFilters,
}: ProjectFilterProps) {
  const isFiltered = modeFilter !== "all" || searchQuery.trim().length > 0;

  return (
    <div className="space-y-4 mb-6">
      {/* Top Filter & Search Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Mode Filter Pills */}
        <div className="workspace-filter-pills flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => onModeFilterChange("all")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
              modeFilter === "all"
                ? "workspace-filter-active"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Semua ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => onModeFilterChange("short_video")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition whitespace-nowrap ${
              modeFilter === "short_video"
                ? "workspace-filter-active"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Short Video (9:16) ({shortCount})</span>
          </button>
          <button
            type="button"
            onClick={() => onModeFilterChange("long_storyboard")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition whitespace-nowrap ${
              modeFilter === "long_storyboard"
                ? "workspace-filter-active"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Storyboard (16:9) ({storyboardCount})</span>
          </button>
        </div>

        {/* Search & Sort Controls */}
        <div className="flex items-center gap-2.5 flex-1 lg:max-w-md">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              type="text"
              placeholder="Cari nama atau deskripsi project..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="workspace-filter-input h-9 rounded-xl pl-9 pr-8 text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchQueryChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
                title="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="relative shrink-0">
            <select
              value={sortOption}
              onChange={(e) => onSortOptionChange(e.target.value as ProjectSortOption)}
              className="workspace-filter-input h-9 cursor-pointer appearance-none rounded-xl px-3 py-1 pr-8 text-xs text-muted-foreground focus:outline-none"
            >
              <option value="newest">Terbaru</option>
              <option value="oldest">Terlama</option>
              <option value="name_asc">Nama (A-Z)</option>
              <option value="name_desc">Nama (Z-A)</option>
            </select>
            <ArrowUpDown className="w-3 h-3 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Filter Info / Status Bar */}
      <div className="flex items-center justify-between border-t border-border px-1 pt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>
            Menampilkan <strong className="font-medium text-foreground">{filteredCount}</strong>{" "}
            dari <strong className="font-medium text-foreground">{totalCount}</strong> project
          </span>
          {searchQuery && (
            <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">
              kata kunci: &quot;{searchQuery}&quot;
            </span>
          )}
        </div>

        {isFiltered && (
          <button
            type="button"
            onClick={onResetFilters}
            className="flex items-center gap-1.5 text-xs font-medium text-[#A9472C] transition hover:underline"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Filter</span>
          </button>
        )}
      </div>
    </div>
  );
}
