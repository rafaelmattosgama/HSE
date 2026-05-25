import type { ReactNode } from "react";
import { HelpPopover } from "@/components/ui/help-popover";
import { cn } from "@/lib/utils";

type Tone = "default" | "brand" | "success" | "info" | "warning" | "danger" | "violet";

const toneClassName: Record<Tone, string> = {
  default: "app-kpi-card--default",
  brand: "app-kpi-card--brand",
  success: "app-kpi-card--success",
  info: "app-kpi-card--info",
  warning: "app-kpi-card--warning",
  danger: "app-kpi-card--danger",
  violet: "app-kpi-card--violet",
};

export function AppHero({
  eyebrow,
  title,
  description,
  actions,
  className,
  helpLabel = "Info",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  helpLabel?: string;
}) {
  const helpTitle = typeof title === "string" ? title : "Help";
  const helpBody = typeof description === "string" ? description : null;

  return (
    <header className={cn("app-hero rounded-2xl p-6", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="app-section-eyebrow">{eyebrow}</p> : null}
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{title}</h1>
        </div>
        {actions || helpBody ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {helpBody ? <HelpPopover title={helpTitle} body={helpBody} buttonLabel={helpLabel} /> : null}
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function AppPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("app-panel rounded-2xl p-5", className)}>{children}</section>;
}

export function AppCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <article className={cn("app-card", className)}>{children}</article>;
}

export function AppSectionHeader({
  eyebrow,
  title,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="app-section-eyebrow">{eyebrow}</p> : null}
        {title ? <h2 className="text-base font-black text-slate-950">{title}</h2> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function AppKpiCard({
  label,
  value,
  detail,
  icon,
  tone = "default",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <article className={cn("app-kpi-card", toneClassName[tone], className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="app-kpi-card__label">{label}</p>
          <p className="app-kpi-card__value">{value}</p>
        </div>
        {icon ? <div className="app-kpi-card__icon">{icon}</div> : null}
      </div>
      {detail ? <p className="app-kpi-card__detail">{detail}</p> : null}
    </article>
  );
}
