"use client";

import { useTranslations } from "next-intl";
import {
  getPublicBuildInfoPresentation,
  parsePublicBuildInfo,
  type PublicBuildInfo,
} from "@/lib/build-info";

const configuredBuildInfo = parsePublicBuildInfo(process.env.NEXT_PUBLIC_LOGIN_BUILD_INFO);

export function LoginBuildInfo({ info = configuredBuildInfo }: { info?: PublicBuildInfo | null }) {
  const t = useTranslations("buildInfo");
  const presentation = getPublicBuildInfoPresentation(info);

  if (!presentation) return null;

  return (
    <p className="pt-1 text-[11px] leading-snug text-white/75 md:text-[12px]">
      {t(presentation.messageKey, { value: presentation.value })}
    </p>
  );
}
