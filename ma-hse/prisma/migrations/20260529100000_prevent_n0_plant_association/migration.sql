-- Prevent N0_ADMIN roles from being associated with a plant
-- N0_ADMIN is a global system role, not tied to any plant/factory

CREATE OR REPLACE FUNCTION check_n0_no_plant()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Role" r
    WHERE r."id" = NEW."roleId"
    AND r."code" = 'N0_ADMIN'
    AND NEW."plantId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'N0_ADMIN role cannot be associated with a plant/factory'
      USING HINT = 'N0 users can only be created via script and must have plantId = NULL';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_check_n0_no_plant
AFTER INSERT OR UPDATE ON "UserPlantRole"
FOR EACH ROW
EXECUTE FUNCTION check_n0_no_plant();

-- Also cleanup any existing invalid data (though the 20260528150000 migration already set plantId = NULL for N0)
