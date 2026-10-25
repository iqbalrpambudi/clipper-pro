import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Cliper Pro — AI Short Video Maker (TikTok/Reels/Shorts)",
  description:
    "Otomatisasi pembuatan video pendek viral dari materi video mentah menggunakan AI scene detection, template narasi, Gemini TTS, dan subtitle karaoke.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/30 font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
