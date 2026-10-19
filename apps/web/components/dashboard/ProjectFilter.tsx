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
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#181818] border border-[#2E2E2E] overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => onModeFilterChange("all")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
              modeFilter === "all"
                ? "bg-[#2A2A2A] text-white shadow-xs font-semibold"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            Semua ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => onModeFilterChange("short_video")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition whitespace-nowrap ${
              modeFilter === "short_video"
                ? "bg-[#3ECF8E]/20 text-[#3ECF8E] font-semibold border border-[#3ECF8E]/30"
                : "text-muted-foreground hover:text-white"
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
                ? "bg-violet-500/20 text-violet-300 font-semibold border border-violet-500/30"
                : "text-muted-foreground hover:text-white"
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
              className="pl-9 pr-8 h-9 text-xs bg-[#181818] border-[#2E2E2E] focus:border-[#3ECF8E]/60 rounded-xl"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchQueryChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white p-0.5"
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
              className="h-9 px-3 pr-8 py-1 bg-[#181818] rounded-xl border border-[#2E2E2E] text-muted-foreground hover:text-white text-xs focus:outline-none focus:border-[#3ECF8E]/60 appearance-none cursor-pointer"
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
      <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-[#222222] pt-2 px-1">
        <div className="flex items-center gap-2">
          <span>
            Menampilkan <strong className="text-white font-medium">{filteredCount}</strong> dari{" "}
            <strong className="text-white font-medium">{totalCount}</strong> project
          </span>
          {searchQuery && (
            <span className="text-[11px] bg-[#222222] text-zinc-300 px-2 py-0.5 rounded-md font-mono">
              kata kunci: &quot;{searchQuery}&quot;
            </span>
          )}
        </div>

        {isFiltered && (
          <button
            type="button"
            onClick={onResetFilters}
            className="flex items-center gap-1.5 text-xs text-[#3ECF8E] hover:underline hover:text-[#34D399] transition font-medium"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Filter</span>
          </button>
        )}
      </div>
    </div>
  );
}
