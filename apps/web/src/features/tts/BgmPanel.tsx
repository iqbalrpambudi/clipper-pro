import { useQuery } from "@tanstack/react-query";
import { Music2 } from "lucide-react";
import { api } from "@/lib/api";
import { useUpdateProject } from "@/hooks/useProjects";
import { Project } from "@/types";
import { SectionPanel } from "@/components/fragments/SectionPanel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";

// Radix Select cannot hold an empty value, so "no track" gets its own key
const NONE = "__none__";

export function BgmPanel({ project }: { project: Project }) {
  const { data: moods = [] } = useQuery({ queryKey: ["bgm-moods"], queryFn: api.getBgmMoods });
  const updateProject = useUpdateProject();
  const mood = project.background_fill?.bgm_mood || NONE;

  return (
    <SectionPanel
      title="Musik latar"
      description="Lagu bebas royalti dari folder storage/bgm, dicampur pelan di bawah narasi."
      icon={<Music2 className="w-4 h-4 text-primary" />}
      className="!border-surface-border !bg-card"
      headerClassName="!border-surface-border !bg-card"
    >
      <div className="space-y-3 p-4">
        <div>
          <label
            htmlFor="bgm-mood"
            className="block text-xs font-semibold text-muted-foreground mb-1"
          >
            Mood musik
          </label>
          <Select
            value={mood}
            disabled={updateProject.isPending}
            onValueChange={(v) =>
              updateProject.mutate({
                id: project.id,
                data: {
                  background_fill: { ...project.background_fill, bgm_mood: v === NONE ? null : v },
                },
              })
            }
          >
            <SelectTrigger id="bgm-mood">
              <SelectValue />
            </SelectTrigger>
            <SelectContent appearance="workspace">
              <SelectItem value={NONE}>Tanpa lagu</SelectItem>
              {moods.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {project.bgm_credit && (
          <div>
            <span className="block text-xs font-semibold text-muted-foreground mb-1">
              Atribusi (wajib di deskripsi video)
            </span>
            <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-2.5 font-mono text-xs text-foreground">
              {project.bgm_credit}
            </pre>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {moods.length === 0
            ? "Folder storage/bgm masih kosong. Isi dulu dengan file mp3 per mood."
            : "Render ulang video supaya musik baru ikut masuk."}
        </p>
      </div>
    </SectionPanel>
  );
}
