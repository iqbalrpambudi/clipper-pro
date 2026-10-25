"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, Sparkles, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge } from "@/components/ui";

export function AppearanceTab() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Memuat preferensi tema...
      </div>
    );
  }

  const themes = [
    {
      id: "light",
      name: "Claude Light",
      badge: "Warm Parchment",
      description: "Warna terang berkarakter kertas ivory hangat dengan aksen terracotta Claude (#C45B3A).",
      icon: Sun,
      bgPreview: "#F3F0E8",
      cardPreview: "#FBFAF7",
      textPreview: "#26251F",
      accentPreview: "#C45B3A",
      borderPreview: "#E5E1D7",
    },
    {
      id: "dark",
      name: "Claude Dark",
      badge: "Warm Obsidian",
      description: "Warna gelap hangat berbasis arang obsidian espresso dengan aksen coral terracotta Claude (#D97757).",
      icon: Moon,
      bgPreview: "#1B1A17",
      cardPreview: "#262421",
      textPreview: "#EDE8DF",
      accentPreview: "#D97757",
      borderPreview: "#3D3933",
    },
    {
      id: "system",
      name: "Sesuai Sistem",
      badge: "Otomatis",
      description: "Menyesuaikan otomatis dengan preferensi tampilan perangkat atau browser Anda saat ini.",
      icon: Monitor,
      bgPreview: resolvedTheme === "dark" ? "#1B1A17" : "#F3F0E8",
      cardPreview: resolvedTheme === "dark" ? "#262421" : "#FBFAF7",
      textPreview: resolvedTheme === "dark" ? "#EDE8DF" : "#26251F",
      accentPreview: resolvedTheme === "dark" ? "#D97757" : "#C45B3A",
      borderPreview: resolvedTheme === "dark" ? "#3D3933" : "#E5E1D7",
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-serif font-semibold text-foreground">
          Tema &amp; Tampilan Antarmuka
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Pilih tema tampilan yang mengacu pada sistem desain Claude. Setiap komponen, kartu, tombol, dan formulir mendukung mode Terang dan Gelap.
        </p>
      </div>

      {/* Theme Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {themes.map((t) => {
          const Icon = t.icon;
          const isSelected = theme === t.id;

          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={`group text-left rounded-2xl border p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isSelected
                  ? "border-primary bg-primary/5 shadow-md shadow-primary/10 ring-1 ring-primary/40"
                  : "border-border bg-card hover:border-border/80 hover:bg-muted/40 shadow-sm"
              }`}
            >
              {/* Mini UI Mockup */}
              <div
                className="relative mb-3.5 h-28 w-full rounded-xl p-3 border shadow-inner transition-transform group-hover:scale-[1.01]"
                style={{
                  backgroundColor: t.bgPreview,
                  borderColor: t.borderPreview,
                }}
              >
                {/* Mini Card */}
                <div
                  className="rounded-lg p-2.5 border shadow-sm"
                  style={{
                    backgroundColor: t.cardPreview,
                    borderColor: t.borderPreview,
                  }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div
                      className="h-2 w-16 rounded"
                      style={{ backgroundColor: t.textPreview, opacity: 0.8 }}
                    />
                    <div
                      className="h-2 w-6 rounded-full"
                      style={{ backgroundColor: t.accentPreview }}
                    />
                  </div>
                  <div
                    className="h-1.5 w-24 rounded mb-2"
                    style={{ backgroundColor: t.textPreview, opacity: 0.4 }}
                  />
                  <div className="flex items-center gap-1.5">
                    <div
                      className="h-4 w-12 rounded flex items-center justify-center text-[7px] font-bold"
                      style={{
                        backgroundColor: t.accentPreview,
                        color: t.id === "dark" || (t.id === "system" && resolvedTheme === "dark") ? "#1B1A17" : "#FFFFFF",
                      }}
                    >
                      Tombol
                    </div>
                    <div
                      className="h-4 w-10 rounded border"
                      style={{
                        backgroundColor: t.bgPreview,
                        borderColor: t.borderPreview,
                      }}
                    />
                  </div>
                </div>

                {isSelected && (
                  <div className="absolute top-2 right-2 bg-primary text-primary-foreground p-1 rounded-full shadow-sm">
                    <Check className="h-3 w-3 stroke-[3]" />
                  </div>
                )}
              </div>

              {/* Title & Badge */}
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-serif font-semibold text-sm text-foreground flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <span>{t.name}</span>
                </span>
                <Badge
                  variant={isSelected ? "workspace-accent" : "workspace"}
                  className="text-[10px]"
                >
                  {t.badge}
                </Badge>
              </div>

              {/* Description */}
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {t.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Palette Overview Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>Palet Warna Aktif ({resolvedTheme === "dark" ? "Claude Dark" : "Claude Light"})</span>
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Harmoni warna HSL yang digunakan di seluruh tombol, card, sidebar, dan studio layout.
              </CardDescription>
            </div>
            <Badge variant="workspace-accent" className="font-mono text-[10px]">
              {resolvedTheme === "dark" ? "30° Warm Charcoal HSL" : "40° Warm Cream HSL"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            <div className="space-y-1.5 p-2 rounded-xl border border-border bg-card">
              <div className="h-10 rounded-lg border border-border bg-background shadow-inner" />
              <div className="text-[11px] font-medium text-foreground">Background</div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {resolvedTheme === "dark" ? "#1B1A17" : "#F3F0E8"}
              </div>
            </div>

            <div className="space-y-1.5 p-2 rounded-xl border border-border bg-card">
              <div className="h-10 rounded-lg border border-border bg-card shadow-inner" />
              <div className="text-[11px] font-medium text-foreground">Surface Card</div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {resolvedTheme === "dark" ? "#262421" : "#FBFAF7"}
              </div>
            </div>

            <div className="space-y-1.5 p-2 rounded-xl border border-border bg-card">
              <div className="h-10 rounded-lg border border-border bg-primary shadow-inner" />
              <div className="text-[11px] font-medium text-foreground">Terracotta Brand</div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {resolvedTheme === "dark" ? "#D97757" : "#C45B3A"}
              </div>
            </div>

            <div className="space-y-1.5 p-2 rounded-xl border border-border bg-card">
              <div className="h-10 rounded-lg border border-border bg-muted shadow-inner" />
              <div className="text-[11px] font-medium text-foreground">Muted Surface</div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {resolvedTheme === "dark" ? "#312E29" : "#F1EEE6"}
              </div>
            </div>

            <div className="space-y-1.5 p-2 rounded-xl border border-border bg-card">
              <div className="h-10 rounded-lg border border-border bg-foreground shadow-inner" />
              <div className="text-[11px] font-medium text-foreground">Foreground Text</div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {resolvedTheme === "dark" ? "#EDE8DF" : "#26251F"}
              </div>
            </div>

            <div className="space-y-1.5 p-2 rounded-xl border border-border bg-card">
              <div className="h-10 rounded-lg border border-border bg-border shadow-inner" />
              <div className="text-[11px] font-medium text-foreground">Border Divider</div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {resolvedTheme === "dark" ? "#3D3933" : "#E5E1D7"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
