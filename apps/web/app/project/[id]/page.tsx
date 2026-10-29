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

  let targetMode: "short" | "storyboard" | "motion" = "short";

  try {
    const res = await fetch(`${API_URL}/api/v1/projects/${id}`, {
      cache: "no-store",
    });

    if (res.ok) {
      const project = await res.json();
      if (project.project_type === "motion_graphic") {
        targetMode = "motion";
      } else if (project.project_type === "long_storyboard") {
        targetMode = "storyboard";
      } else {
        targetMode = "short";
      }
    }
  } catch (err) {
    console.error("ProjectRedirectPage: Server fetch error, falling back to client route:", err);
  }

  redirect(`/project/${targetMode}/${id}`);
}

