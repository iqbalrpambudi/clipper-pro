const rawApiUrl = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/$/, "");

export const API_BASE_URL = rawApiUrl;

/**
 * Resolve an API or storage path against `VITE_API_URL` if configured,
 * or return the relative path so Vite dev proxy / Nginx reverse proxy handles it.
 */
export function resolveApiUrl(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE_URL) return path;
  return path.startsWith("/") ? `${API_BASE_URL}${path}` : `${API_BASE_URL}/${path}`;
}
