import type { MasterDataEntityType } from "@prisma/client";
import { processMasterDataTranslations } from "@/lib/services/master-data-translation-service";

export type MasterDataTranslationJob = {
  entityType: MasterDataEntityType;
  entityId: string;
};

export async function handleMasterDataTranslation(job: MasterDataTranslationJob) {
  await processMasterDataTranslations(job);
}
