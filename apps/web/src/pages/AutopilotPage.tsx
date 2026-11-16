import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Clock,
  ExternalLink,
  Factory,
  Layers,
  Loader2,
  Play,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { resolveApiUrl } from "@/env";
import { useStudioStore } from "@/lib/store";
import { WorkspaceShell } from "@/components/layout";
import { Badge, Button, Input, Switch, Textarea } from "@/components/ui";
import { SectionPanel } from "@/components/fragments/SectionPanel";
import { AutopilotConfig, AutopilotRun } from "@/types";

const CONFIG_KEY = ["autopilot"];
const RUNS_KEY = ["autopilot-runs"];

const STAGE_LABEL: Record<string, string> = {
  idea: "Mencari ide",
  sourcing: "Mencari footage",
  processing: "Download & tagging scene",
  script: "Menulis naskah",
  voice: "Membuat suara",
  render: "Render video",
  metadata: "Menulis judul & deskripsi",
  ready: "Siap di pool",
  upload: "Upload ke YouTube",
  done: "Selesai",
};

/** Format a UTC timestamp in the channel's fixed UTC offset (e.g. WIB) instead of the browser's zone. */
function formatInOffset(iso: string, offsetMinutes: number): string {
  const d = new Date(Date.parse(iso) + offsetMinutes * 60_000);
  const date = d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const time = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${date}, ${time}`;
}

function offsetLabel(minutes: number): string {
  const named: Record<number, string> = { 420: "WIB", 480: "WITA", 540: "WIT" };
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const utc = `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, "0")}` : ""}`;
  return named[minutes] ? `${named[minutes]} (${utc})` : utc;
}

/** Next local HH:MM from the list, as "hari ini 12:00" / "besok 12:00". */
function nextLocalTime(times: string[], offsetMinutes: number): string | null {
  if (!times.length) return null;
  const local = new Date(Date.now() + offsetMinutes * 60_000);
  const now = `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
  const sorted = [...times].sort();
  const today = sorted.find((t) => t > now);
  return today ? `hari ini ${today}` : `besok ${sorted[0]}`;
}

function RunStatusBadge({ run }: { run: AutopilotRun }) {
  if (run.status === "running" || run.stage === "upload") {
    return (
      <Badge variant="workspace-accent" className="gap-1 px-2 py-0.5 text-xs">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        {STAGE_LABEL[run.stage] ?? run.stage}
      </Badge>
    );
  }
  if (run.status === "ready") {
    return (
      <Badge variant="workspace" className="px-2 py-0.5 text-xs">
        Siap di pool
      </Badge>
    );
  }
  return (
    <Badge
      variant={run.status === "scheduled" ? "workspace-success" : "workspace-warning"}
      className="px-2 py-0.5 text-xs"
    >
      {run.status === "scheduled" ? "Terjadwal di YouTube" : "Gagal"}
    </Badge>
  );
}

export function AutopilotPage() {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();

  const { data: status } = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: api.getAutopilot,
    refetchInterval: 10_000,
  });
  const { data: runs = [] } = useQuery({
    queryKey: RUNS_KEY,
    queryFn: api.getAutopilotRuns,
    refetchInterval: (q) =>
      q.state.data?.some((r) => r.status === "running" || r.stage === "upload") ? 5_000 : 30_000,
  });
  const { data: presets = [] } = useQuery({
    queryKey: ["discovery-presets"],
    queryFn: api.getDiscoveryPresets,
  });

  const [form, setForm] = useState<AutopilotConfig | null>(null);
  const [newSlot, setNewSlot] = useState("12:00");

  // Seed the form once; later refetches (every 10s) must not wipe unsaved edits
  useEffect(() => {
    if (status && !form) {
      const { producing: _p, pool_count: _c, youtube_connected: _yt, ...cfg } = status;
      setForm(cfg);
    }
  }, [status, form]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: RUNS_KEY });
    queryClient.invalidateQueries({ queryKey: CONFIG_KEY });
  };

  const saveMutation = useMutation({
    mutationFn: api.saveAutopilot,
    onSuccess: (data, vars) => {
      queryClient.setQueryData(CONFIG_KEY, data);
      setForm((f) => (f ? { ...f, enabled: data.enabled } : f));
      showToast(
        vars.enabled !== status?.enabled
          ? vars.enabled
            ? "Autopilot aktif. Pool diisi & video diposting otomatis sesuai jadwal."
            : "Autopilot dimatikan"
          : "Pengaturan autopilot disimpan",
        "success"
      );
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const produceMutation = useMutation({
    mutationFn: api.produceAutopilotNow,
    onSuccess: () => {
      setTimeout(refresh, 1000);
      showToast("Mulai membuat 1 video untuk pool", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const discardMutation = useMutation({
    mutationFn: api.discardPoolVideo,
    onSuccess: () => {
      refresh();
      showToast("Video dibuang dari pool", "info");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  if (!form || !status) {
    return (
      <WorkspaceShell activePage="autopilot">
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Memuat" />
        </div>
      </WorkspaceShell>
    );
  }

  const offset = form.utc_offset_minutes;
  const tz = offsetLabel(offset).split(" ")[0];

  const update = <K extends keyof AutopilotConfig>(key: K, value: AutopilotConfig[K]) =>
    setForm({ ...form, [key]: value });

  const toggleCategory = (id: string) =>
    update(
      "categories",
      form.categories.includes(id) ? form.categories.filter((c) => c !== id) : [...form.categories, id]
    );

  const addSlot = () => {
    if (!newSlot || form.slots.includes(newSlot)) return;
    update("slots", [...form.slots, newSlot].sort());
  };

  const updateWindow = (i: number, patch: Partial<AutopilotConfig["production_windows"][number]>) =>
    update(
      "production_windows",
      form.production_windows.map((w, j) => (j === i ? { ...w, ...patch } : w))
    );

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  // Pool in posting order (oldest first), plus whatever is being built right now
  const pool = runs
    .filter((r) => r.status === "ready" || r.status === "running")
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const history = runs.filter((r) => r.status === "scheduled" || r.status === "failed");
  const nextScheduled = runs
    .filter((r) => r.status === "scheduled" && r.slot_at && Date.parse(r.slot_at) > Date.now())
    .sort((a, b) => Date.parse(a.slot_at!) - Date.parse(b.slot_at!))[0];
  const poolFull = status.pool_count >= status.pool_size;
  const poolLow = status.pool_count < 2;

  return (
    <WorkspaceShell activePage="autopilot">
      <div className="workspace-settings space-y-4">
        <header className="workspace-settings-intro">
          <p className="workspace-page-eyebrow">Channel otomatis</p>
          <h1 className="workspace-page-title">Autopilot YouTube Shorts</h1>
          <p className="workspace-page-description">
            Produksi mengisi pool video siap tayang di jam yang Anda tentukan. Saat jam posting tiba, video
            tertua di pool dijadwalkan ke YouTube, jadi channel tetap posting walau produksi sedang macet.
          </p>
        </header>

        {!status.youtube_connected && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
          >
            <span className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              Channel YouTube belum tersambung. Autopilot butuh channel untuk upload.
            </span>
            <Button asChild variant="workspace-secondary" size="workspace-sm">
              <Link to="/settings?tab=publish">Hubungkan</Link>
            </Button>
          </div>
        )}

        {/* Power + live status */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center gap-4">
            <Switch
              id="autopilot-enabled"
              checked={status.enabled}
              disabled={saveMutation.isPending || !status.youtube_connected}
              onCheckedChange={(enabled) => saveMutation.mutate({ ...form, enabled })}
              aria-describedby="autopilot-state"
            />
            <div>
              <label htmlFor="autopilot-enabled" className="text-sm font-bold text-foreground">
                {status.enabled ? "Autopilot aktif" : "Autopilot nonaktif"}
              </label>
              <p id="autopilot-state" className="text-xs text-muted-foreground">
                {status.enabled
                  ? "Berjalan di background: produksi mengisi pool, posting mengambil dari pool."
                  : "Nyalakan supaya pool diisi & video diposting otomatis."}
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border p-3">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Layers className="h-3.5 w-3.5" aria-hidden="true" /> Pool siap tayang
              </dt>
              <dd className={`mt-1 text-lg font-bold ${poolLow ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                {status.pool_count} / {status.pool_size}
              </dd>
              {poolLow && <p className="text-xs text-amber-600 dark:text-amber-400">Pool menipis</p>}
            </div>
            <div className="rounded-lg border border-border p-3">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Factory className="h-3.5 w-3.5" aria-hidden="true" /> Produksi berikutnya
              </dt>
              <dd className="mt-1 text-sm font-semibold text-foreground">
                {status.producing
                  ? "Sedang membuat video..."
                  : poolFull
                    ? "Pool penuh, produksi dilewati"
                    : `${nextLocalTime(form.production_windows.map((w) => w.time), offset) ?? "-"} ${tz}`}
              </dd>
            </div>
            <div className="rounded-lg border border-border p-3">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Tayang berikutnya
              </dt>
              <dd className="mt-1 text-sm font-semibold text-foreground">
                {nextScheduled?.slot_at ? `${formatInOffset(nextScheduled.slot_at, offset)} ${tz}` : "Belum ada"}
              </dd>
            </div>
          </dl>
        </div>

        {/* Pool */}
        <SectionPanel
          title="Pool video"
          description="Diposting berurutan dari yang paling lama. Buang video yang tidak layak tayang."
          actions={
            <Button
              type="button"
              variant="workspace-secondary"
              size="workspace-sm"
              onClick={() => produceMutation.mutate()}
              disabled={status.producing || poolFull || produceMutation.isPending || !status.youtube_connected}
              title={poolFull ? "Pool sudah penuh" : "Buat 1 video untuk pool sekarang"}
            >
              {produceMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Buat 1 video sekarang
            </Button>
          }
        >
          {pool.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">Pool kosong.</p>
          ) : (
            <ol className="divide-y divide-border">
              {pool.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {r.title || r.topic || "Mencari ide..."}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {presets.find((p) => p.id === r.category)?.title ?? r.category ?? "-"} · dibuat{" "}
                      {formatInOffset(r.created_at, offset)}
                    </p>
                    {r.publish_error && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-rose-500">
                        Upload gagal, dicoba lagi: {r.publish_error}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <RunStatusBadge run={r} />
                    {r.status === "ready" && r.project_id && r.render_job_id && (
                      <Button asChild variant="workspace-quiet" size="workspace-sm">
                        <a
                          href={resolveApiUrl(`/api/v1/projects/${r.project_id}/render/download/${r.render_job_id}`)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Tonton
                        </a>
                      </Button>
                    )}
                    {r.project_id && (
                      <Button asChild variant="workspace-quiet" size="workspace-sm">
                        <Link to={`/project/short/${r.project_id}`}>Project</Link>
                      </Button>
                    )}
                    {r.status === "ready" && r.stage !== "upload" && (
                      <Button
                        type="button"
                        variant="workspace-quiet"
                        size="workspace-sm"
                        onClick={() => discardMutation.mutate(r.id)}
                        disabled={discardMutation.isPending}
                        aria-label={`Buang ${r.title ?? "video"} dari pool`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </SectionPanel>

        {/* Config */}
        <form onSubmit={handleSave} className="space-y-6 rounded-xl border border-border bg-card p-5 shadow-xs">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Jam posting ({offsetLabel(offset)})</p>
              <div className="flex flex-wrap items-center gap-2">
                {form.slots.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 font-mono text-xs"
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => update("slots", form.slots.filter((x) => x !== s))}
                      disabled={form.slots.length === 1}
                      aria-label={`Hapus jam posting ${s}`}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <Input
                  type="time"
                  value={newSlot}
                  onChange={(e) => setNewSlot(e.target.value)}
                  className="w-28"
                  aria-label="Jam posting baru"
                />
                <Button type="button" variant="workspace-quiet" size="workspace-sm" onClick={addSlot}>
                  <Plus className="h-3.5 w-3.5" />
                  Tambah
                </Button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Jadwal produksi ({tz})</p>
              <div className="space-y-2">
                {form.production_windows.map((w, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={w.time}
                      onChange={(e) => updateWindow(i, { time: e.target.value })}
                      className="w-28"
                      aria-label={`Jam produksi ${i + 1}`}
                    />
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={w.count}
                      onChange={(e) => updateWindow(i, { count: Number(e.target.value) })}
                      className="w-20"
                      aria-label={`Jumlah video produksi ${i + 1}`}
                    />
                    <span className="text-xs text-muted-foreground">video</span>
                    <button
                      type="button"
                      onClick={() =>
                        update("production_windows", form.production_windows.filter((_, j) => j !== i))
                      }
                      disabled={form.production_windows.length === 1}
                      aria-label={`Hapus jam produksi ${w.time}`}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="workspace-quiet"
                  size="workspace-sm"
                  onClick={() =>
                    update("production_windows", [...form.production_windows, { time: "09:00", count: 1 }])
                  }
                  disabled={form.production_windows.length >= 6}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tambah jam produksi
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="ap-pool" className="mb-1 block text-xs font-semibold text-muted-foreground">
                Ukuran pool (video)
              </label>
              <Input
                id="ap-pool"
                type="number"
                min={1}
                max={20}
                value={form.pool_size}
                onChange={(e) => update("pool_size", Number(e.target.value))}
              />
            </div>
            <div>
              <label htmlFor="ap-ahead" className="mb-1 block text-xs font-semibold text-muted-foreground">
                Upload terjadwal maks. (jam sebelum tayang)
              </label>
              <Input
                id="ap-ahead"
                type="number"
                min={1}
                max={72}
                value={form.publish_ahead_hours}
                onChange={(e) => update("publish_ahead_hours", Number(e.target.value))}
              />
            </div>
            <div>
              <label htmlFor="ap-duration" className="mb-1 block text-xs font-semibold text-muted-foreground">
                Target durasi (detik)
              </label>
              <Input
                id="ap-duration"
                type="number"
                min={15}
                max={170}
                value={form.target_duration}
                onChange={(e) => update("target_duration", Number(e.target.value))}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Kategori (bergiliran tiap video)</p>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => {
                const on = form.categories.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleCategory(p.id)}
                    aria-pressed={on}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      on
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p.badge || p.title}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="ap-niche" className="mb-1 block text-xs font-semibold text-muted-foreground">
              Arahan channel untuk AI
            </label>
            <Textarea id="ap-niche" rows={3} value={form.niche} onChange={(e) => update("niche", e.target.value)} />
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="workspace-primary"
              size="workspace-sm"
              disabled={saveMutation.isPending || form.categories.length === 0}
            >
              {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Simpan Pengaturan
            </Button>
          </div>
        </form>

        {/* History */}
        <SectionPanel title="Riwayat" description="Video yang sudah dijadwalkan dan produksi yang gagal">
          {history.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">Belum ada riwayat.</p>
          ) : (
            <ul className="divide-y divide-border">
              {history.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground">{r.title || r.topic || "-"}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.slot_at
                        ? `Tayang ${formatInOffset(r.slot_at, offset)} ${tz}`
                        : `Dicoba ${formatInOffset(r.created_at, offset)} ${tz}`}
                      {r.category ? ` · ${presets.find((p) => p.id === r.category)?.title ?? r.category}` : ""}
                    </p>
                    {r.status === "failed" && r.error_message && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-rose-500">{r.error_message}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <RunStatusBadge run={r} />
                    {r.project_id && (
                      <Button asChild variant="workspace-quiet" size="workspace-sm">
                        <Link to={`/project/short/${r.project_id}`}>Project</Link>
                      </Button>
                    )}
                    {r.video_id && (
                      <Button asChild variant="workspace-quiet" size="workspace-sm">
                        <a href={`https://studio.youtube.com/video/${r.video_id}/edit`} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Studio
                        </a>
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionPanel>
      </div>
    </WorkspaceShell>
  );
}
