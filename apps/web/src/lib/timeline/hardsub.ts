import type { Hardsub } from "@/types";

// Mirrors CROP_MIN_TOP in apps/api/app/services/hardsub.py: a band starting at/below 70% of the
// height is cropped off; a higher band would cost too much picture, so it is blurred instead.
export const CROP_MIN_TOP = 0.7;

export type HardsubTreatment =
  | { kind: "crop"; top: number }
  | { kind: "blur"; top: number; bottom: number };

/** How the burned-in subtitle band is hidden (same rule as the renderer); null = nothing to hide. */
export function hardsubTreatment(hs?: Hardsub | null): HardsubTreatment | null {
  if (!hs?.enabled) return null;
  const { top, bottom } = hs;
  if (!(top >= 0 && top < bottom && bottom <= 1)) return null;
  return top >= CROP_MIN_TOP ? { kind: "crop", top } : { kind: "blur", top, bottom };
}
