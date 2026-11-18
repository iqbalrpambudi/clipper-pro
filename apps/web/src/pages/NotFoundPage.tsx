import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="workspace-theme min-h-screen flex flex-col items-center justify-center bg-background text-foreground gap-4 px-4">
      <h2 className="font-serif text-2xl font-medium">Halaman tidak ditemukan</h2>
      <p className="text-sm text-muted-foreground">
        Project mungkin sudah dihapus atau URL tidak valid.
      </p>
      <Link
        to="/"
        className="text-sm font-medium text-primary hover:text-primary/80 underline underline-offset-4"
      >
        Kembali ke Dashboard
      </Link>
    </div>
  );
}
