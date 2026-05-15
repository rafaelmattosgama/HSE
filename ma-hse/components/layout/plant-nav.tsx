"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  spotlight?: boolean;
};

export function PlantNav({
  items,
  utilityItems,
}: {
  items: NavItem[];
  utilityItems: NavItem[];
}) {
  const pathname = usePathname();

  return (
    <nav className="space-y-2">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "block rounded-lg border px-3 py-2.5 text-sm leading-5 transition",
              isActive
                ? "border-[var(--brand-300)] bg-[var(--brand-50)] font-semibold text-[var(--brand-700)] shadow-[0_8px_18px_rgba(6,26,82,0.08)]"
                : item.spotlight
                  ? "border-amber-200 bg-amber-50 font-semibold text-amber-900 hover:bg-amber-100"
                  : "border-transparent font-medium text-slate-700 hover:border-slate-200 hover:bg-slate-50",
            )}
          >
            {item.label}
          </Link>
        );
      })}

      {utilityItems.length ? (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <div className="space-y-2">
            {utilityItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "block rounded-lg px-3 py-2.5 text-sm leading-5 transition",
                    isActive
                      ? "bg-teal-50 font-semibold text-teal-800"
                      : "font-medium text-teal-700 hover:bg-teal-50",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </nav>
  );
}
