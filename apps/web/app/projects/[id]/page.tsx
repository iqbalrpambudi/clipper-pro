"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useProject } from "@/hooks/useProjects";
import { Button } from "@/components/ui";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function LegacyProjectsRedirectPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { data: project, isLoading, error } = useProject(id);

  useEffect(() => {
    if (!project) return;
    const mode = project.project_type === "long_storyboard" ? "storyboard" : "short";
    router.replace(`/project/${mode}/${id}`);
  }, [project, id, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#121212] text-white">
        <Loader2 className="w-8 h-8 text-[#3ECF8E] animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">Mengarahkan ke Studio...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#121212] text-white">
        <p className="text-sm text-rose-400 mb-4">Project tidak ditemukan atau gagal dimuat.</p>
        <Link href="/">
          <Button variant="outline" size="sm" className="border-[#2E2E2E]">
            Kembali ke Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#121212] text-white">
      <Loader2 className="w-8 h-8 text-[#3ECF8E] animate-spin mb-3" />
      <p className="text-sm text-muted-foreground">Membuka Studio Project...</p>
    </div>
  );
}
