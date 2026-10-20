import { useEffect, useState } from "react";

const PEAKS_PER_SECOND = 100;
const cache = new Map<string, { peaks: Float32Array; duration: number }>();

/** Decode an audio file once and return normalized peak amplitudes for waveform drawing. */
export function useAudioPeaks(url?: string | null) {
  const [data, setData] = useState<{ peaks: Float32Array; duration: number } | null>(
    url ? cache.get(url) || null : null
  );
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url) {
      setData(null);
      return;
    }
    const cached = cache.get(url);
    if (cached) {
      setData(cached);
      return;
    }
    let cancelled = false;
    setError(false);

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx: AudioContext = new Ctx();
        const audio = await ctx.decodeAudioData(buf);
        ctx.close().catch(() => {});

        const channel = audio.getChannelData(0);
        const count = Math.max(1, Math.ceil(audio.duration * PEAKS_PER_SECOND));
        const block = Math.max(1, Math.floor(channel.length / count));
        const peaks = new Float32Array(count);
        let max = 0;
        for (let i = 0; i < count; i++) {
          let peak = 0;
          const start = i * block;
          const end = Math.min(channel.length, start + block);
          for (let j = start; j < end; j += 4) {
            const v = Math.abs(channel[j]);
            if (v > peak) peak = v;
          }
          peaks[i] = peak;
          if (peak > max) max = peak;
        }
        if (max > 0) for (let i = 0; i < count; i++) peaks[i] /= max;

        const result = { peaks, duration: audio.duration };
        cache.set(url, result);
        if (!cancelled) setData(result);
      } catch (e) {
        console.warn("[waveform] failed to decode audio", e);
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  return { peaks: data?.peaks || null, duration: data?.duration || 0, error };
}
