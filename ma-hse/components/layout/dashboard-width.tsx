"use client";

import type { ComponentProps } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Share the dashboard's desktop width between the topbar and the plant layout. */
export function DashboardWidth({ className, ...props }: ComponentProps<"div">) {
  const pathname = usePathname();
  const isDashboard = /^\/app\/(?:corporate|[^/]+\/(?:dashboards|environment-dashboard))\/?$/.test(pathname ?? "");

  return (
    <div
      {...props}
      className={cn(className, isDashboard && "lg:max-w-none")}
    />
  );
}
