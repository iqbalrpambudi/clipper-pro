"use client";

import React from "react";
import Link from "next/link";
import {
  Film,
  Video,
  Image as ImageIcon,
  Edit3,
  Trash2,
  ArrowRight,
  Calendar,
} from "lucide-react";
import { Project } from "@/types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
  Badge,
  Button,
} from "@/components/ui";

interface ProjectCardProps {
  project: Project;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}

export function ProjectCard({ project, onEdit, onDelete }: ProjectCardProps) {
  const isStoryboard = project.project_type === "long_storyboard";

  const formattedDate = React.useMemo(() => {
    if (!project.created_at) return null;
    try {
      const date = new Date(project.created_at);
      return new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
    } catch {
      return null;
    }
  }, [project.created_at]);

  return (
    <Card
      className={`group relative border-[#2E2E2E] bg-[#181818] transition-all duration-200 flex flex-col justify-between hover:bg-[#1C1C1C] hover:shadow-xl ${
        isStoryboard
          ? "hover:border-violet-500/50 hover:shadow-violet-500/5"
          : "hover:border-[#3ECF8E]/50 hover:shadow-[#3ECF8E]/5"
      }`}
    >
      <CardHeader className="p-5 pb-3">
        {/* Top Badges & Actions */}
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {isStoryboard ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/30 font-semibold">
                <ImageIcon className="w-3 h-3 text-violet-400" />
                Storyboard • 16:9 • {project.resolution}
              </span>
            ) : (
              <Badge variant="supabase" className="font-mono text-[11px] font-semibold">
                {project.aspect_ratio || "9:16"} • {project.resolution}
              </Badge>
            )}

            {project.language === "en" ? (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center gap-1 font-semibold">
                🇬🇧 EN
              </span>
            ) : (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-semibold">
                🇮🇩 ID
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit(project);
              }}
              className="text-muted-foreground hover:text-white hover:bg-white/5 h-7 w-7"
              title="Edit Nama Project"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(project);
              }}
              className="text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 h-7 w-7"
              title="Hapus Project"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Project Name */}
        <Link href={`/projects/${project.id}`}>
          <CardTitle
            className={`text-base font-bold text-white transition leading-snug line-clamp-1 ${
              isStoryboard ? "group-hover:text-violet-400" : "group-hover:text-[#3ECF8E]"
            }`}
          >
            {project.name}
          </CardTitle>
        </Link>

        {/* Project Description */}
        {project.description ? (
          <CardDescription className="text-xs text-muted-foreground line-clamp-2 mt-1.5">
            {project.description}
          </CardDescription>
        ) : (
          <p className="text-xs text-muted-foreground/40 italic mt-1.5">
            Tidak ada deskripsi tambahan
          </p>
        )}

        {/* Date info if available */}
        {formattedDate && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 mt-2 font-mono">
            <Calendar className="w-3 h-3" />
            <span>{formattedDate}</span>
          </div>
        )}
      </CardHeader>

      {/* Card Footer: Metadata counts and Studio Link */}
      <CardFooter className="p-5 pt-3 border-t border-[#2E2E2E]/60 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {isStoryboard ? (
            <>
              <span className="flex items-center gap-1 text-violet-300">
                <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
                {project.storyboard_count || 0} Ilustrasi
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Film className="w-3.5 h-3.5" />
                Long Explainer
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1">
                <Video className="w-3.5 h-3.5 text-muted-foreground" />
                {project.source_video_count || 0} Media
              </span>
              <span className="flex items-center gap-1">
                <Film className="w-3.5 h-3.5 text-muted-foreground" />
                {project.scene_count || 0} Scene
              </span>
            </>
          )}
        </div>

        <Link
          href={`/projects/${project.id}`}
          className={`flex items-center gap-1 font-semibold group-hover:translate-x-0.5 transition ${
            isStoryboard ? "text-violet-400" : "text-[#3ECF8E]"
          }`}
        >
          <span>{isStoryboard ? "Storyboard Studio" : "Clip Studio"}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </CardFooter>
    </Card>
  );
}
