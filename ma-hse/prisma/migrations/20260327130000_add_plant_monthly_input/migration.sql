CREATE TABLE "PlantMonthlyInput" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "workerCount" INTEGER,
    "hoursWorked" DECIMAL(12,2),
    "energyConsumedMwh" DECIMAL(12,2),
    "waterConsumedNetworkM3" DECIMAL(12,2),
    "waterConsumedCapturedM3" DECIMAL(12,2),
    "compressedAirConsumedM3" DECIMAL(12,2),
    "compressedAirConsumedMwh" DECIMAL(12,2),
    "nonHazardousWasteTons" DECIMAL(12,2),
    "hazardousWasteTons" DECIMAL(12,2),
    "recycledWasteTons" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantMonthlyInput_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlantMonthlyInput_plantId_year_month_key" ON "PlantMonthlyInput"("plantId", "year", "month");
CREATE INDEX "PlantMonthlyInput_plantId_year_idx" ON "PlantMonthlyInput"("plantId", "year");

ALTER TABLE "PlantMonthlyInput" ADD CONSTRAINT "PlantMonthlyInput_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
