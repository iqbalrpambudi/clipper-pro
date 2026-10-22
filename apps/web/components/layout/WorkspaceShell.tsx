import type { ReactNode } from "react";
import Link from "next/link";
import { Film, LayoutGrid, Palette, Settings } from "lucide-react";

export type WorkspacePage = "projects" | "image-studio" | "settings";

const navigation = [
  { href: "/", label: "Project", id: "projects", icon: LayoutGrid },
  { href: "/image-studio", label: "Art Studio", id: "image-studio", icon: Palette },
  { href: "/settings", label: "Pengaturan", id: "settings", icon: Settings },
] as const;

function WorkspaceNavigation({ activePage }: { activePage: WorkspacePage }) {
  return (
    <nav aria-label="Navigasi studio" className="workspace-nav">
      {navigation.map(({ href, label, id, icon: Icon }) => (
        <Link
          key={id}
          href={href}
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
          <Link className="workspace-brand" href="/" aria-label="Cliper Pro, dashboard">
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
            <strong>Ruang kerja kreatif</strong>
            Kelola project, gaya visual, dan pengaturan produksi Anda.
          </div>
        </aside>

        <div className="workspace-mobile-header">
          <Link className="workspace-brand" href="/" aria-label="Cliper Pro, dashboard">
            <span className="workspace-brand-mark">
              <Film className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <span className="workspace-brand-copy">
              Cliper Pro
              <small>Creator studio</small>
            </span>
          </Link>
          <WorkspaceNavigation activePage={activePage} />
        </div>

        <main className="workspace-main">{children}</main>
      </div>
    </div>
  );
}
