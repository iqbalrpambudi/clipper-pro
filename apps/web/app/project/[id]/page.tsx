import { redirect } from "next/navigation";

// Use INTERNAL_API_URL when running server-side inside Docker network (http://api:8080)
const API_URL =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://api:8080";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectRedirectPage({ params }: PageProps) {
  const { id } = await params;

  try {
    const res = await fetch(`${API_URL}/api/v1/projects/${id}`, {
      cache: "no-store",
    });

    if (res.ok) {
      const project = await res.json();
      const mode =
        project.project_type === "long_storyboard" ? "storyboard" : "short";
      redirect(`/project/${mode}/${id}`);
    }
  } catch (err) {
    console.error("ProjectRedirectPage: Server fetch error, falling back to client route:", err);
  }

  // Safe fallback to short project page where the client-side useProject hook handles loading
  redirect(`/project/short/${id}`);
}

