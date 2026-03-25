import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/layout/logout-button";
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

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/app/corporate" className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
            MA HSE
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-600">{session.user.name}</div>
            <LogoutButton />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
