BEGIN;

ALTER TABLE "ReservationSeat"
ADD COLUMN "releasedAt" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "ReservationSeat_active_seatId_key"
ON "ReservationSeat"("seatId")
WHERE "releasedAt" IS NULL;

DROP INDEX "ReservationSeat_seatId_key";

ALTER TABLE "Ticket"
DROP CONSTRAINT "Ticket_usage_state_check";

ALTER TABLE "Ticket"
ADD CONSTRAINT "Ticket_usage_state_check"
CHECK (
  ("status" IN ('VALID', 'CANCELLED') AND "usedAt" IS NULL AND "usedByGateId" IS NULL)
  OR ("status" = 'USED' AND "usedAt" IS NOT NULL AND "usedByGateId" IS NOT NULL)
);

COMMIT;
