import Image from "next/image";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/layout/logout-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { authOptions } from "@/lib/auth/options";

export default async function SecureAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  const homeHref = session.user.plantRoles.some((entry) => entry.role === "N0_ADMIN") ? "/app/settings" : "/app/corporate";

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
          <Link href={homeHref} className="flex items-center gap-3 text-[var(--brand-700)]">
            <div className="flex h-14 w-20 items-center justify-center rounded-2xl border border-slate-200 bg-white px-2 py-1 shadow-sm">
              <Image src="/max-safety-logo.svg" alt="MAx Safety" width={64} height={28} className="h-auto w-full" priority />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Integrated Safety Platform</span>
              <span className="text-xl font-bold leading-tight text-[var(--brand-700)]">MAx Safety</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="text-sm text-slate-600">{session.user.name}</div>
            <LogoutButton />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
