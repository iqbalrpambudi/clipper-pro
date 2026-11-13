"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { SentenceSegment, SubtitleStyle } from "@/types";

/** ASS text for the in-browser preview, built by the backend generator the final render uses. */
export function useAssPreview(projectId: string, style: SubtitleStyle | null, segments: SentenceSegment[]): string {
  const [ass, setAss] = useState("");

  useEffect(() => {
    if (!style || style.enabled === false || !segments.length) {
      setAss("");
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .renderAss(projectId, style, segments)
        .then((res) => !cancelled && setAss(res.ass_content))
        .catch((err) => console.warn("[subtitle preview]", err));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, style, segments]);

  return ass;
}

// JASSUB needs a parseable script even when there is nothing to show.
export const EMPTY_ASS = "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n";
