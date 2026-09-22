"use client";

import type { ComponentProps } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Share the wide modules' desktop width between the topbar and the plant layout. */
export function DashboardWidth({ className, ...props }: ComponentProps<"div">) {
  const pathname = usePathname();
  const isWideModule = /^\/app\/(?:corporate|[^/]+\/(?:dashboards|environment-dashboard))\/?$/.test(pathname ?? "")
    || /^\/app\/[^/]+\/(?:communications|actions)(?:\/|$)/.test(pathname ?? "");

  return (
    <div
      {...props}
      className={cn(className, isWideModule && "lg:max-w-none")}
    />
  );
}
