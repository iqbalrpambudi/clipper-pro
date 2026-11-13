import { Navigate, createBrowserRouter, useParams } from "react-router-dom";
import { DashboardPage } from "@/pages/DashboardPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { StudioPage } from "@/pages/StudioPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

function RedirectToShortProject() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/" replace />;
  return <Navigate to={`/project/short/${id}`} replace />;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <DashboardPage />,
  },
  {
    path: "/settings",
    element: <SettingsPage />,
  },
  {
    path: "/project/short/:id",
    element: <StudioPage />,
  },
  // Legacy route redirects preserved from next.config.mjs
  {
    path: "/projects/:id",
    element: <RedirectToShortProject />,
  },
  {
    path: "/project/:id",
    element: <RedirectToShortProject />,
  },
  {
    path: "/projects/short/:id",
    element: <RedirectToShortProject />,
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);
