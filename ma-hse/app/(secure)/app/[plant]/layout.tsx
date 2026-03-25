import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";

const items = [
  { href: "communications", label: "Communications" },
  { href: "validation", label: "Validation" },
  { href: "actions", label: "Actions" },
  { href: "dashboards", label: "Dashboards" },
  { href: "sewo", label: "S-EWO" },
  { href: "admin", label: "Admin" },
];

export default async function PlantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ plant: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const { plant } = await params;

  const hasPlantAccess = session.user.plantRoles.some((entry) => entry.plantCode === plant || entry.role === "N1_CORPORATE");
  if (!hasPlantAccess) {
    redirect("/app/corporate");
  }

  return (
    <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-6 py-6 md:grid-cols-[240px_1fr]">
      <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Plant {plant.toUpperCase()}</p>
        <nav className="space-y-2">
          {items.map((item) => (
            <Link key={item.href} href={`/app/${plant}/${item.href}`} className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
              {item.label}
            </Link>
          ))}
          <Link href="/app/corporate" className="block rounded-md px-3 py-2 text-sm text-teal-700 hover:bg-teal-50">
            Corporate
          </Link>
        </nav>
      </aside>

      <section className="space-y-5">{children}</section>
    </div>
  );
}