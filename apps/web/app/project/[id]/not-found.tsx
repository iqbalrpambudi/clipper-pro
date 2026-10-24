import Link from "next/link";

export default function ProjectNotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground gap-4">
      <h2 className="text-lg font-semibold">Project tidak ditemukan</h2>
      <p className="text-sm text-muted-foreground">
        Project mungkin sudah dihapus atau URL tidak valid.
      </p>
      <Link
        href="/"
        className="text-sm text-primary hover:text-primary/80 underline underline-offset-4"
      >
        Kembali ke Dashboard
      </Link>
    </div>
  );
}
