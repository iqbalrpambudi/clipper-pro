import React from "react";
import { Link } from "react-router-dom";
import {
  Film,
  Video,
  Edit3,
  Trash2,
  ArrowRight,
  Calendar,
} from "lucide-react";
import { Project } from "@/types";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter, Button } from "@/components/ui";

interface ProjectCardProps {
  project: Project;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}

export function ProjectCard({ project, onEdit, onDelete }: ProjectCardProps) {
  const projectUrl = `/project/short/${project.id}`;

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
    <Card className="workspace-project-card group relative flex flex-col justify-between">
      <div className="workspace-project-art" aria-hidden="true">
        <span>VIDEO PROJECT</span>
      </div>
      <CardHeader className="workspace-project-card-header">
        <div className="mb-2.5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="workspace-project-type">
              <Video aria-hidden="true" />
              Clip pendek
            </span>
            <span className="workspace-project-format">
              {project.aspect_ratio || "9:16"} ·{" "}
              {project.resolution}
            </span>

            {project.language === "en" ? (
              <span className="workspace-language-tag">EN</span>
            ) : project.language === "id" ? (
              <span className="workspace-language-tag">ID</span>
            ) : null}
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
              className="workspace-card-action"
              title="Ubah nama project"
              aria-label={`Ubah nama project ${project.name}`}
            >
              <Edit3 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(project);
              }}
              className="workspace-card-action is-destructive"
              title="Hapus project"
              aria-label={`Hapus project ${project.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <Link to={projectUrl} className="workspace-project-title-link">
          <CardTitle className="workspace-project-title">{project.name}</CardTitle>
        </Link>

        {project.description ? (
          <CardDescription className="workspace-project-description">
            {project.description}
          </CardDescription>
        ) : (
          <p className="workspace-project-description is-empty">Tidak ada deskripsi tambahan</p>
        )}

        {formattedDate && (
          <div className="workspace-project-date">
            <Calendar aria-hidden="true" />
            <span>Dibuat {formattedDate}</span>
          </div>
        )}
      </CardHeader>

      <CardFooter className="workspace-project-footer">
        <div className="flex items-center gap-3">
              <span className="workspace-project-stat">
                <Video aria-hidden="true" />
                {project.source_video_count || 0} media
              </span>
              <span className="workspace-project-stat">
                <Film aria-hidden="true" />
                {project.scene_count || 0} scene
              </span>
        </div>

        <Link to={projectUrl} className="workspace-project-link">
          <span>Buka</span>
          <ArrowRight aria-hidden="true" />
        </Link>
      </CardFooter>
    </Card>
  );
}
