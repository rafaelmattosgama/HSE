import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";

/**
 * §5.2: public tag-resolution route — no session required to resolve the
 * tag itself. tagCode never carries a plant slug (a reprinted batch of
 * labels survives a plant rename); the database is what maps it to a plant
 * and equipment. Checking the session here only decides which URL to send
 * the browser to next — it never gates the resolution itself.
 *
 * Fase 0 ponto 6 confirmed there's no existing "return to where I was after
 * login" mechanism in this app (every `redirect("/login")` elsewhere drops
 * the original destination). Rather than touch the shared
 * `[plant]/layout.tsx` auth gate used by every `/app/[plant]/*` route, the
 * small prerequisite the spec anticipated is done here instead — this route
 * already knows the exact final destination, so it either sends the
 * browser straight there (already authenticated) or to
 * `/login?callbackUrl=<that destination>` (see the matching fix in
 * `login/page.tsx`, which now honors an explicit callbackUrl before falling
 * back to its own role-based default landing page).
 */
export default async function FireEquipmentTagResolutionPage({
  params,
}: {
  params: Promise<{ tagCode: string }>;
}) {
  const { tagCode } = await params;

  const assignment = await prisma.fireEquipmentTagAssignment.findFirst({
    where: { tagCode, isActive: true },
    select: {
      fireEquipment: {
        select: {
          id: true,
          isActive: true,
          plant: { select: { code: true, isActive: true } },
        },
      },
    },
  });

  const equipment = assignment?.fireEquipment;
  if (!equipment || !equipment.isActive || !equipment.plant.isActive) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-slate-900">Ficha não reconhecida</h1>
          <p className="mt-2 text-sm text-slate-600">
            Esta ficha não está associada a nenhum equipamento ativo. Contacta a equipa de segurança da tua unidade.
          </p>
          <p className="mt-4 text-xs text-slate-400">This tag isn&apos;t linked to any active equipment.</p>
        </div>
      </main>
    );
  }

  const destination = `/app/${equipment.plant.code}/fire-equipment/${equipment.id}?fromTag=1`;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(destination)}`);
  }

  redirect(destination);
}
