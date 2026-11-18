import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bot, Film, LayoutGrid, Settings } from "lucide-react";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { resolveApiUrl } from "@/env";

export type WorkspacePage = "projects" | "autopilot" | "settings";

const navigation = [
  { href: "/", label: "Project", id: "projects", icon: LayoutGrid },
  { href: "/autopilot", label: "Autopilot", id: "autopilot", icon: Bot },
  { href: "/settings", label: "Pengaturan", id: "settings", icon: Settings },
] as const;

function WorkspaceNavigation({ activePage }: { activePage: WorkspacePage }) {
  return (
    <nav aria-label="Navigasi studio" className="workspace-nav">
      {navigation.map(({ href, label, id, icon: Icon }) => (
        <Link
          key={id}
          to={href}
          aria-current={activePage === id ? "page" : undefined}
          className="workspace-nav-link"
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

function AppVersion() {
  const { data } = useQuery({
    queryKey: ["app-version"],
    queryFn: async () => (await fetch(resolveApiUrl("/api/v1/version"))).json() as Promise<{ version: string }>,
    staleTime: Infinity,
  });
  return data ? <p className="mt-2 mb-0">Versi {data.version}</p> : null;
}

export function WorkspaceShell({
  activePage,
  children,
}: {
  activePage: WorkspacePage;
  children: ReactNode;
}) {
  return (
    <div className="workspace-theme">
      <div className="workspace-shell">
        <aside className="workspace-sidebar" aria-label="Navigasi utama">
          <Link className="workspace-brand" to="/" aria-label="Cliper Pro, dashboard">
            <span className="workspace-brand-mark">
              <Film className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <span className="workspace-brand-copy">
              Cliper Pro
              <small>Creator studio</small>
            </span>
          </Link>

          <p className="workspace-nav-label">Workspace</p>
          <WorkspaceNavigation activePage={activePage} />

          <div className="workspace-sidebar-footer">
            <div className="flex items-center justify-between mb-2">
              <strong className="!mb-0">Mode Tampilan</strong>
              <ThemeToggle align="start" />
            </div>
            Kelola project dan pengaturan produksi Anda.
            <AppVersion />
          </div>
        </aside>

        <div className="workspace-mobile-header">
          <div className="flex items-center justify-between w-full">
            <Link className="workspace-brand" to="/" aria-label="Cliper Pro, dashboard">
              <span className="workspace-brand-mark">
                <Film className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <span className="workspace-brand-copy">
                Cliper Pro
                <small>Creator studio</small>
              </span>
            </Link>
            <ThemeToggle align="end" />
          </div>
          <WorkspaceNavigation activePage={activePage} />
        </div>

        <main className="workspace-main">{children}</main>
      </div>
    </div>
  );
}
