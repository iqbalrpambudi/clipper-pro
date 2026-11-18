import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Link2, Loader2, Send, Youtube } from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { StudioTabHeader } from "@/components/layout";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/components/ui";
import { SectionPanel } from "@/components/fragments/SectionPanel";
import { Narration, Project, RenderJob, YouTubePrivacy, YouTubeUpload } from "@/types";
import { useYouTubeAccount } from "./useYouTubeAccount";

interface PublishTabProps {
  project: Project & { narration?: Narration | null; render_jobs?: RenderJob[] };
}

type Visibility = YouTubePrivacy | "scheduled";

const STATUS_LABEL: Record<YouTubeUpload["status"], string> = {
  queued: "Antre",
  uploading: "Mengupload",
  uploaded: "Terupload",
  failed: "Gagal",
};

const PRIVACY_LABEL: Record<YouTubePrivacy, string> = {
  public: "Publik",
  unlisted: "Unlisted",
  private: "Private",
};

/** `<input type="datetime-local">` value for one hour from now, in local time. */
function defaultScheduleValue(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultDescription(project: PublishTabProps["project"]): string {
  return [project.narration?.raw_text?.split("\n\n")[0], project.description]
    .filter(Boolean)
    .join("\n\n");
}

export function PublishTab({ project }: PublishTabProps) {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();
  const { data: account, isLoading: accountLoading, connect, isConnecting } = useYouTubeAccount();

  const finalJobs = (project.render_jobs ?? []).filter(
    (j) => j.render_type === "final" && j.status === "completed"
  );

  const [renderJobId, setRenderJobId] = useState(finalJobs[0]?.id ?? "");
  const [title, setTitle] = useState(`${project.name} #shorts`.slice(0, 100));
  const [description, setDescription] = useState(() => defaultDescription(project));
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [scheduleAt, setScheduleAt] = useState(defaultScheduleValue);

  const uploadsKey = ["youtube-uploads", project.id];
  const { data: uploads = [] } = useQuery({
    queryKey: uploadsKey,
    queryFn: () => api.getYouTubeUploads(project.id),
    refetchInterval: (q) =>
      q.state.data?.some((u) => u.status === "queued" || u.status === "uploading") ? 2000 : false,
  });

  const publishMutation = useMutation({
    mutationFn: () =>
      api.publishToYouTube(project.id, {
        render_job_id: renderJobId || undefined,
        title: title.trim(),
        description: description.trim(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        privacy: visibility === "scheduled" ? "private" : visibility,
        publish_at: visibility === "scheduled" ? new Date(scheduleAt).toISOString() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: uploadsKey });
      showToast("Upload ke YouTube dimulai", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    publishMutation.mutate();
  };

  return (
    <div className="flex flex-col">
      <StudioTabHeader
        icon={Send}
        title="Publish"
        description="Upload video final langsung ke channel YouTube, sekarang atau terjadwal."
      />

      <div className="mx-auto grid w-full max-w-[1920px] items-start gap-6 px-4 py-5 sm:px-6 lg:grid-cols-2">
        {accountLoading ? null : !account?.connected ? (
          <SectionPanel
            icon={<Youtube className="w-4 h-4 text-brand-400" />}
            title="Channel YouTube belum tersambung"
            description={
              account?.configured
                ? "Kredensial sudah tersimpan. Hubungkan channel untuk mulai publish."
                : "Isi Client ID & Client Secret Google di Settings dulu."
            }
            actions={
              account?.configured ? (
                <Button
                  variant="workspace-primary"
                  size="workspace-sm"
                  onClick={connect}
                  disabled={isConnecting}
                >
                  {isConnecting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Link2 className="w-3.5 h-3.5" />
                  )}
                  Hubungkan Channel
                </Button>
              ) : (
                <Button asChild variant="workspace-primary" size="workspace-sm">
                  <Link to="/settings?tab=publish">Buka Settings</Link>
                </Button>
              )
            }
          >
            <span className="sr-only">Channel belum tersambung</span>
          </SectionPanel>
        ) : (
          <SectionPanel
            icon={<Youtube className="w-4 h-4 text-brand-400" />}
            title="Detail video"
            badge={
              <Badge variant="workspace" className="px-2 py-0.5 text-xs">
                {account.channel_title}
              </Badge>
            }
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              {finalJobs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Belum ada render final yang selesai. Render dulu di tab Render & Export.
                </p>
              ) : (
                <div>
                  <label
                    htmlFor="pub-render"
                    className="block text-xs font-semibold text-muted-foreground mb-1"
                  >
                    Video
                  </label>
                  <Select value={renderJobId} onValueChange={(v) => setRenderJobId(v)}>
                    <SelectTrigger id="pub-render">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent appearance="workspace">
                      {finalJobs.map((j, i) => (
                        <SelectItem key={j.id} value={j.id}>
                          {i === 0 ? "Render terbaru" : "Render"} ·{" "}
                          {new Date(j.completed_at ?? j.created_at).toLocaleString("id-ID")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <label
                  htmlFor="pub-title"
                  className="flex justify-between text-xs font-semibold text-muted-foreground mb-1"
                >
                  <span>Judul</span>
                  <span className="font-mono">{title.length}/100</span>
                </label>
                <Input
                  id="pub-title"
                  required
                  maxLength={100}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div>
                <label
                  htmlFor="pub-desc"
                  className="flex justify-between text-xs font-semibold text-muted-foreground mb-1"
                >
                  <span>Deskripsi</span>
                  <span className="font-mono">{description.length}/5000</span>
                </label>
                <Textarea
                  id="pub-desc"
                  rows={6}
                  maxLength={5000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div>
                <label
                  htmlFor="pub-tags"
                  className="block text-xs font-semibold text-muted-foreground mb-1"
                >
                  Tag (pisahkan dengan koma)
                </label>
                <Input
                  id="pub-tags"
                  placeholder="fakta unik, pertanian, proses pembuatan"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="pub-visibility"
                    className="block text-xs font-semibold text-muted-foreground mb-1"
                  >
                    Visibilitas
                  </label>
                  <Select value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
                    <SelectTrigger id="pub-visibility">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent appearance="workspace">
                      <SelectItem value="public">Publik sekarang</SelectItem>
                      <SelectItem value="scheduled">Jadwalkan</SelectItem>
                      <SelectItem value="unlisted">Unlisted</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {visibility === "scheduled" && (
                  <div>
                    <label
                      htmlFor="pub-schedule"
                      className="block text-xs font-semibold text-muted-foreground mb-1"
                    >
                      Tayang pada
                    </label>
                    <Input
                      id="pub-schedule"
                      type="datetime-local"
                      required
                      value={scheduleAt}
                      onChange={(e) => setScheduleAt(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="workspace-primary"
                  size="workspace-sm"
                  disabled={finalJobs.length === 0 || publishMutation.isPending}
                >
                  {publishMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  {visibility === "scheduled" ? "Jadwalkan di YouTube" : "Upload ke YouTube"}
                </Button>
              </div>
            </form>
          </SectionPanel>
        )}

        {uploads.length > 0 && (
          <SectionPanel title="Riwayat publish">
            <ul className="divide-y divide-border">
              {uploads.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground">{u.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.publish_at
                        ? `Terjadwal ${new Date(u.publish_at).toLocaleString("id-ID")}`
                        : PRIVACY_LABEL[u.privacy]}
                      {u.status === "failed" && u.error_message ? ` · ${u.error_message}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant={
                        u.status === "failed"
                          ? "workspace-warning"
                          : u.status === "uploaded"
                            ? "workspace-success"
                            : "workspace"
                      }
                      className="px-2 py-0.5 text-xs"
                    >
                      {STATUS_LABEL[u.status]}
                      {u.status === "uploading" ? ` ${u.progress}%` : ""}
                    </Badge>
                    {u.video_id && (
                      <Button asChild variant="workspace-quiet" size="workspace-sm">
                        <a
                          href={`https://studio.youtube.com/video/${u.video_id}/edit`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Studio
                        </a>
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </SectionPanel>
        )}
      </div>
    </div>
  );
}
