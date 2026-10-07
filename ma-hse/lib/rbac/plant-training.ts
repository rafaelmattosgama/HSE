import { RoleCode } from "@prisma/client";

export const TRAINING_VIEW_ROLES: RoleCode[] = [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR, RoleCode.N6_HR];
export const TRAINING_REGISTER_ROLES: RoleCode[] = [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N6_HR];
export const TRAINING_CATALOG_ROLES: RoleCode[] = [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY];
