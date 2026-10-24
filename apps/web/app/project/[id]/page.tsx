import { redirect, notFound } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectRedirectPage({ params }: PageProps) {
  const { id } = await params;

  try {
    const res = await fetch(`${API_URL}/api/v1/projects/${id}`, {
      cache: "no-store",
    });

    if (!res.ok) notFound();

    const project = await res.json();
    const mode =
      project.project_type === "long_storyboard" ? "storyboard" : "short";

    redirect(`/project/${mode}/${id}`);
  } catch {
    notFound();
  }
}
