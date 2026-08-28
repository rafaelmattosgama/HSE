-- PostgreSQL renames the enum value in place, retaining all existing
-- UserPlantRole rows instead of leaving dormant MEDICO assignments behind.
ALTER TYPE "RoleCode" RENAME VALUE 'MEDICO' TO 'N6_HR';
