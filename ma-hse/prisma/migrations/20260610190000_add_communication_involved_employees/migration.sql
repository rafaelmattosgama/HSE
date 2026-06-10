-- Store every worker selected in public unsafe act reports while keeping
-- Communication.targetEmployeeId as the primary/backwards-compatible worker.
CREATE TABLE "CommunicationInvolvedEmployee" (
    "id" TEXT NOT NULL,
    "communicationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationInvolvedEmployee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunicationInvolvedEmployee_communicationId_employeeId_key"
ON "CommunicationInvolvedEmployee"("communicationId", "employeeId");

CREATE INDEX "CommunicationInvolvedEmployee_communicationId_sortOrder_idx"
ON "CommunicationInvolvedEmployee"("communicationId", "sortOrder");

CREATE INDEX "CommunicationInvolvedEmployee_employeeId_idx"
ON "CommunicationInvolvedEmployee"("employeeId");

ALTER TABLE "CommunicationInvolvedEmployee"
ADD CONSTRAINT "CommunicationInvolvedEmployee_communicationId_fkey"
FOREIGN KEY ("communicationId") REFERENCES "Communication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommunicationInvolvedEmployee"
ADD CONSTRAINT "CommunicationInvolvedEmployee_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "EmployeeDirectory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
