import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "@/actions/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guardia: oltre al middleware, blocca l'accesso server-side.
  await requireAdmin();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 p-4">
          <nav className="flex items-center gap-4 text-lg font-semibold">
            <Link href="/admin" className="text-brand hover:underline">
              Sondaggi
            </Link>
            <Link href="/admin/regole" className="text-brand hover:underline">
              Regola ricorrente
            </Link>
          </nav>
          <form action={signOut}>
            <button type="submit" className="btn-secondary px-4 py-2 text-base">
              Esci
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
