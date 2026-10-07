import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Keep every module and the topbar aligned to the available screen width. */
export function DashboardWidth({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn(className, "max-w-none")}
    />
  );
}
