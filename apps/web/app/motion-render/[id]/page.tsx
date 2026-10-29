"use client";

import React, { Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Player, PlayerRef } from "@remotion/player";
import type { MotionScene, Project } from "@/types";
import { MotionProjectComposition } from "@/lib/motion";

declare global {
  interface Window {
    __MOTION_READY__?: boolean;
    __MOTION_ERROR__?: string;
    __setMotionFrame?: (frame: number) => Promise<boolean>;
    __inspectMotionLayout?: (targetFrame?: number) => Promise<{
      valid: boolean;
      frame: number;
      errors: string[];
      warnings: string[];
      overlaps: Array<{
        elementA: string;
        elementB: string;
        overlapPercent: number;
        rectA: { x: number; y: number; w: number; h: number };
        rectB: { x: number; y: number; w: number; h: number };
      }>;
      clippings: Array<{
        element: string;
        direction: string;
        rect: { x: number; y: number; w: number; h: number };
      }>;
      subtitleCollisions: Array<{
        element: string;
        bottomY: number;
      }>;
    }>;
  }
}

interface PageProps {
  params: Promise<{ id: string }>;
}

function getDimensionsForAspect(
  aspectRatio: string,
  wParam: string | null,
  hParam: string | null
): { width: number; height: number } {
  const parsedW = wParam ? parseInt(wParam, 10) : NaN;
  const parsedH = hParam ? parseInt(hParam, 10) : NaN;
  if (Number.isFinite(parsedW) && parsedW > 64 && Number.isFinite(parsedH) && parsedH > 64) {
    return { width: parsedW, height: parsedH };
  }
  if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
  if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
  return { width: 1920, height: 1080 };
}

function MotionRenderStage({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams();
  const playerRef = useRef<PlayerRef>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.__MOTION_READY__ = false;
    window.__MOTION_ERROR__ = undefined;

    async function load() {
      try {
        const res = await fetch(`/api/v1/projects/${projectId}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} saat memuat project motion (${projectId})`);
        }
        const data = (await res.json()) as Project;
        if (!cancelled) {
          setProject(data);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!cancelled) {
          setLoadError(msg);
          window.__MOTION_ERROR__ = msg;
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const aspectRatio = project?.aspect_ratio || "16:9";
  const { width, height } = useMemo(
    () => getDimensionsForAspect(aspectRatio, searchParams.get("w"), searchParams.get("h")),
    [aspectRatio, searchParams]
  );

  const scenes: MotionScene[] = useMemo(() => {
    const raw = project?.motion_scenes || [];
    return [...raw].sort((a, b) => a.order_index - b.order_index);
  }, [project?.motion_scenes]);

  const themeId = useMemo(() => {
    const ws = project?.world_setting as Record<string, unknown> | null | undefined;
    return typeof ws?.motion_theme === "string" ? ws.motion_theme : "claude_editorial";
  }, [project?.world_setting]);

  const totalFrames = useMemo(() => {
    if (!scenes.length) return 90;
    return Math.max(
      45,
      scenes.reduce((acc, s) => acc + Math.max(45, s.duration_frames || 120), 0)
    );
  }, [scenes]);

  const inputProps = useMemo(
    () => ({
      scenes,
      themeId,
      aspectRatio,
      includeAudio: false,
    }),
    [scenes, themeId, aspectRatio]
  );

  useEffect(() => {
    if (!project) return;
    if (!scenes.length) {
      window.__MOTION_ERROR__ = "Project belum memiliki adegan motion (motion_scenes kosong).";
      return;
    }

    let cancelled = false;

    async function armFrameBridge() {
      try {
        if (typeof document !== "undefined" && document.fonts?.ready) {
          await Promise.race([
            document.fonts.ready,
            new Promise((resolve) => setTimeout(resolve, 800)),
          ]);
        }

        // Wait until Remotion Player ref attaches
        for (let attempt = 0; attempt < 60; attempt++) {
          if (playerRef.current || cancelled) break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        if (cancelled) return;
        if (!playerRef.current) {
          window.__MOTION_ERROR__ = "Remotion Player gagal diinisialisasi di halaman render.";
          return;
        }

        playerRef.current.pause();

        window.__setMotionFrame = async (frame: number): Promise<boolean> => {
          const clamped = Math.max(0, Math.min(totalFrames - 1, Math.floor(frame)));
          playerRef.current?.pause();
          playerRef.current?.seekTo(clamped);
          await new Promise<void>((resolve) => {
            let settled = false;
            const finish = () => {
              if (!settled) {
                settled = true;
                resolve();
              }
            };
            const fallbackTimer = setTimeout(finish, 18);
            if (typeof requestAnimationFrame === "function") {
              requestAnimationFrame(() => {
                clearTimeout(fallbackTimer);
                setTimeout(finish, 4);
              });
            }
          });
          return true;
        };

        window.__inspectMotionLayout = async (targetFrame?: number) => {
          if (typeof targetFrame === "number") {
            await window.__setMotionFrame?.(targetFrame);
          }
          const errors: string[] = [];
          const warnings: string[] = [];
          if (window.__MOTION_ERROR__) {
            errors.push(window.__MOTION_ERROR__);
          }

          const overlaps: Array<{
            elementA: string;
            elementB: string;
            overlapPercent: number;
            rectA: { x: number; y: number; w: number; h: number };
            rectB: { x: number; y: number; w: number; h: number };
          }> = [];
          const clippings: Array<{
            element: string;
            direction: string;
            rect: { x: number; y: number; w: number; h: number };
          }> = [];
          const subtitleCollisions: Array<{
            element: string;
            bottomY: number;
          }> = [];

          if (typeof document !== "undefined") {
            const container = document.querySelector<HTMLElement>("[data-remotion-player]") || document.body;
            const candidates = Array.from(
              container.querySelectorAll<HTMLElement>(
                "h1, h2, h3, p, span, [data-motion-card], [data-motion-slot='header'], [data-motion-slot='footer'], [data-motion-slot='hero-stage'] > *"
              )
            ).filter((el) => {
              if (!el || !el.getBoundingClientRect) return false;
              if (el.closest("[data-ambient-canvas]") || el.closest("[data-backdrop]")) return false;
              const style = window.getComputedStyle(el);
              if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity || "1") < 0.1) {
                return false;
              }
              const r = el.getBoundingClientRect();
              return r.width > 30 && r.height > 18;
            });

            // Detect Canvas Clipping & Subtitle Safe Zone Violations
            for (const el of candidates) {
              const r = el.getBoundingClientRect();
              const text = (el.innerText || el.textContent || "").trim().slice(0, 40);
              const tag = `<${el.tagName.toLowerCase()}${text ? ` "${text}"` : ""}>`;

              if (r.left < -12) clippings.push({ element: tag, direction: "left", rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } });
              if (r.right > width + 12) clippings.push({ element: tag, direction: "right", rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } });
              if (r.bottom > height + 12) clippings.push({ element: tag, direction: "bottom", rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } });

              // Subtitle Safe Zone violation for 9:16 portrait
              if (height >= 1920 && r.bottom > height - 230 && r.top < height - 60 && !el.closest("[data-motion-slot='footer']")) {
                subtitleCollisions.push({ element: tag, bottomY: Math.round(r.bottom) });
              }
            }

            // Detect Collisions / Overlaps between sibling elements
            for (let i = 0; i < candidates.length; i++) {
              for (let j = i + 1; j < candidates.length; j++) {
                const a = candidates[i];
                const b = candidates[j];
                if (a.contains(b) || b.contains(a)) continue;

                const rA = a.getBoundingClientRect();
                const rB = b.getBoundingClientRect();

                const intLeft = Math.max(rA.left, rB.left);
                const intRight = Math.min(rA.right, rB.right);
                const intTop = Math.max(rA.top, rB.top);
                const intBottom = Math.min(rA.bottom, rB.bottom);

                if (intRight > intLeft && intBottom > intTop) {
                  const intArea = (intRight - intLeft) * (intBottom - intTop);
                  const areaA = rA.width * rA.height;
                  const areaB = rB.width * rB.height;
                  const overlapFrac = intArea / Math.min(areaA, areaB);

                  if (overlapFrac > 0.18) {
                    const textA = (a.innerText || a.textContent || "").trim().slice(0, 30);
                    const textB = (b.innerText || b.textContent || "").trim().slice(0, 30);
                    if (textA || textB) {
                      overlaps.push({
                        elementA: `<${a.tagName.toLowerCase()}${textA ? ` "${textA}"` : ""}>`,
                        elementB: `<${b.tagName.toLowerCase()}${textB ? ` "${textB}"` : ""}>`,
                        overlapPercent: Math.round(overlapFrac * 100),
                        rectA: { x: Math.round(rA.x), y: Math.round(rA.y), w: Math.round(rA.width), h: Math.round(rA.height) },
                        rectB: { x: Math.round(rB.x), y: Math.round(rB.y), w: Math.round(rB.width), h: Math.round(rB.height) },
                      });
                    }
                  }
                }
              }
            }
          }

          const valid = errors.length === 0 && overlaps.length === 0 && clippings.length === 0;
          return {
            valid,
            frame: targetFrame || 0,
            errors,
            warnings,
            overlaps: overlaps.slice(0, 10),
            clippings: clippings.slice(0, 10),
            subtitleCollisions: subtitleCollisions.slice(0, 10),
          };
        };

        await window.__setMotionFrame(0);
        if (!cancelled) {
          window.__MOTION_READY__ = true;
        }
      } catch (err: unknown) {
        if (!cancelled) {
          window.__MOTION_ERROR__ = err instanceof Error ? err.message : String(err);
        }
      }
    }

    armFrameBridge();
    return () => {
      cancelled = true;
    };
  }, [project, scenes.length, totalFrames]);

  return (
    <div
      style={{
        width,
        height,
        margin: 0,
        padding: 0,
        overflow: "hidden",
        position: "fixed",
        inset: 0,
        backgroundColor: "#000000",
      }}
    >
      <style>{`
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background: #000000 !important;
        }
        nextjs-portal,
        [data-nextjs-toast],
        [data-nextjs-dialog-overlay],
        #__next-build-watcher {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
        }
      `}</style>
      {project && scenes.length > 0 && !loadError ? (
        <Player
          ref={playerRef}
          component={MotionProjectComposition}
          inputProps={inputProps}
          durationInFrames={totalFrames}
          fps={30}
          compositionWidth={width}
          compositionHeight={height}
          controls={false}
          autoPlay={false}
          clickToPlay={false}
          doubleClickToFullscreen={false}
          spaceKeyToPlayOrPause={false}
          acknowledgeRemotionLicense
          style={{
            width,
            height,
            display: "block",
          }}
        />
      ) : null}
    </div>
  );
}

export default function MotionRenderPage({ params }: PageProps) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div style={{ width: "100vw", height: "100vh", background: "#000" }} />}>
      <MotionRenderStage projectId={id} />
    </Suspense>
  );
}
