import { redirect } from "next/navigation";

export default async function PlantIncidentKnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ documentId?: string }>;
}) {
  const { documentId } = await searchParams;
  const query = new URLSearchParams(documentId ? { documentId } : {});
  redirect(`/app/corporate/knowledge-base?${query.toString()}`);
}
