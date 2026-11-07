"use client";

import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as Remotion from "remotion";
import * as LucideIcons from "lucide-react";
import { transform } from "sucrase";
import * as MotionPrimitives from "./primitives";
import type { MotionCue, MotionTransitionType } from "@/types";
import type { MotionTheme } from "./themes";

export interface CompiledSceneProps {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  orientation: "landscape" | "portrait" | "square";
  theme: MotionTheme;
  cues: MotionCue[];
  scriptText: string;
  sceneIndex: number;
  transitionType: MotionTransitionType | string;
  title?: string | null;
  keyFacts?: string[];
}

export interface CompileSceneResult {
  Component: React.ComponentType<CompiledSceneProps> | null;
  error: string | null;
  compileTimeMs: number;
}

// Build case-insensitive lookup map for Lucide icons once
const lucideRaw = LucideIcons as unknown as Record<string, unknown>;
const lucideLowerMap = new Map<string, unknown>();
for (const key of Object.keys(lucideRaw)) {
  if (key !== "default" && key !== "createLucideIcon" && key !== "icons") {
    lucideLowerMap.set(key.toLowerCase(), lucideRaw[key]);
  }
}

const SafeLucideProxy = new Proxy(lucideRaw, {
  get(target, prop: string | symbol) {
    if (typeof prop === "symbol") {
      return Reflect.get(target, prop);
    }
    if (prop === "__esModule") return true;
    if (prop === "default") return SafeLucideProxy;
    if (prop in target && target[prop] !== undefined) {
      return target[prop];
    }
    const clean = prop.replace(/Icon$/i, "").toLowerCase();
    const matched = lucideLowerMap.get(prop.toLowerCase()) || lucideLowerMap.get(clean);
    if (matched) return matched;
    return LucideIcons.Sparkles;
  },
});

const SafeRemotionModule = {
  ...Remotion,
  interpolate: MotionPrimitives.safeInterpolate,
  interpolateColors: MotionPrimitives.safeInterpolateColors,
};

function sandboxRequire(moduleName: string): unknown {
  const clean = String(moduleName || "").trim();
  if (clean === "react") return React;
  if (clean === "react/jsx-runtime" || clean === "react/jsx-dev-runtime") return jsxRuntime;
  if (clean === "remotion") return SafeRemotionModule;
  if (clean === "lucide-react") return SafeLucideProxy;
  if (
    clean === "@motion/primitives" ||
    clean === "./primitives" ||
    clean === "@/lib/motion/primitives" ||
    clean === "motion-primitives"
  ) {
    return MotionPrimitives;
  }
  return {};
}

const compileCache = new Map<string, CompileSceneResult>();

export function compileMotionSceneCode(code?: string | null): CompileSceneResult {
  const trimmed = (code || "").trim();
  if (!trimmed) {
    return { Component: null, error: "Kode TSX belum tersedia.", compileTimeMs: 0 };
  }

  const cached = compileCache.get(trimmed);
  if (cached) {
    return cached;
  }

  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const transpiled = transform(trimmed, {
      transforms: ["typescript", "jsx", "imports"],
      jsxRuntime: "classic",
      production: true,
    }).code;

    const moduleObj: { exports: Record<string, unknown> } = { exports: {} };

    // Provide common primitives in outer scope so omitted imports also work cleanly
    const factory = new Function(
      "require",
      "module",
      "exports",
      "React",
      "useState",
      "useMemo",
      "useRef",
      "useCallback",
      "useEffect",
      "useCurrentFrame",
      "useVideoConfig",
      "AbsoluteFill",
      "Sequence",
      "Series",
      "spring",
      "interpolate",
      "interpolateColors",
      "Easing",
      "random",
      "Icons",
      "AmbientCanvas",
      "CameraRig",
      "KineticWords",
      "DrawSvgPath",
      "SvgIllustration",
      "AnimatedConnector",
      "SpringCard",
      "WindowFrame",
      "AnimatedCounter",
      "RadialRing",
      "BadgePill",
      "useCueFrame",
      "MotionStage",
      "StatCallout",
      "SceneGridLayout",
      "OrbitHubStage",
      "ComparisonDuelStage",
      "ProcessStepperStage",
      "BrowserMockupCard",
      "FocusSpotlight",
      "SPRING_PRESETS",
      "CloudSkyBackdrop",
      "HighlightBlockTitle",
      "NotificationStack",
      "TelemetryScoreboard",
      "ChecklistCard",
      "IsometricIsland",
      "ImpactStamp",
      `"use strict";\n${transpiled}\nreturn module.exports;`
    );

    const exported = factory(
      sandboxRequire,
      moduleObj,
      moduleObj.exports,
      React,
      React.useState,
      React.useMemo,
      React.useRef,
      React.useCallback,
      React.useEffect,
      Remotion.useCurrentFrame,
      Remotion.useVideoConfig,
      Remotion.AbsoluteFill,
      Remotion.Sequence,
      Remotion.Series,
      Remotion.spring,
      MotionPrimitives.safeInterpolate,
      MotionPrimitives.safeInterpolateColors,
      Remotion.Easing,
      Remotion.random,
      SafeLucideProxy,
      MotionPrimitives.AmbientCanvas,
      MotionPrimitives.CameraRig,
      MotionPrimitives.KineticWords,
      MotionPrimitives.DrawSvgPath,
      MotionPrimitives.SvgIllustration,
      MotionPrimitives.AnimatedConnector,
      MotionPrimitives.SpringCard,
      MotionPrimitives.WindowFrame,
      MotionPrimitives.AnimatedCounter,
      MotionPrimitives.RadialRing,
      MotionPrimitives.BadgePill,
      MotionPrimitives.useCueFrame,
      MotionPrimitives.MotionStage,
      MotionPrimitives.StatCallout,
      MotionPrimitives.SceneGridLayout,
      MotionPrimitives.OrbitHubStage,
      MotionPrimitives.ComparisonDuelStage,
      MotionPrimitives.ProcessStepperStage,
      MotionPrimitives.BrowserMockupCard,
      MotionPrimitives.FocusSpotlight,
      MotionPrimitives.SPRING_PRESETS,
      MotionPrimitives.CloudSkyBackdrop,
      MotionPrimitives.HighlightBlockTitle,
      MotionPrimitives.NotificationStack,
      MotionPrimitives.TelemetryScoreboard,
      MotionPrimitives.ChecklistCard,
      MotionPrimitives.IsometricIsland,
      MotionPrimitives.ImpactStamp
    ) as Record<string, unknown>;

    const candidate =
      exported?.default ||
      exported?.Scene ||
      Object.values(exported || {}).find((v) => typeof v === "function");

    const elapsed = Math.round(
      ((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0) * 10
    ) / 10;

    if (typeof candidate !== "function") {
      const errRes: CompileSceneResult = {
        Component: null,
        error: "Komponen Scene tidak ditemukan pada export default.",
        compileTimeMs: elapsed,
      };
      return errRes;
    }

    const okRes: CompileSceneResult = {
      Component: candidate as React.ComponentType<CompiledSceneProps>,
      error: null,
      compileTimeMs: elapsed,
    };

    if (compileCache.size > 150) {
      const oldestKey = compileCache.keys().next().value;
      if (oldestKey) compileCache.delete(oldestKey);
    }
    compileCache.set(trimmed, okRes);
    return okRes;
  } catch (err: unknown) {
    const elapsed = Math.round(
      ((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0) * 10
    ) / 10;
    return {
      Component: null,
      error: err instanceof Error ? err.message : String(err),
      compileTimeMs: elapsed,
    };
  }
}

