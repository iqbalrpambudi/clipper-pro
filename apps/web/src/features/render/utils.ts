export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function parseNumericDelta(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const match = value.match(/[+-]?\d+/);
    if (match) return Number.parseInt(match[0], 10);
  }
  return fallback;
}

export function getSafeProjectFilename(project?: {
  name?: string | null;
  id?: string | null;
}): string {
  const raw = (project?.name || "video").trim();
  const cleaned = raw
    .replace(/[\\/*?:"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || `video_${project?.id?.slice(0, 8) || "export"}`) + ".mp4";
}
