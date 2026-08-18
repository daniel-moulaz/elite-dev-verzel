CREATE TYPE "PaymentStatus" AS ENUM ('APPROVED', 'DECLINED');

CREATE TYPE "TicketStatus" AS ENUM ('VALID', 'USED');

ALTER TABLE "ReservationSeat"
ADD COLUMN "id" UUID;

UPDATE "ReservationSeat"
SET "id" = gen_random_uuid();

ALTER TABLE "ReservationSeat"
ALTER COLUMN "id" SET NOT NULL;

CREATE UNIQUE INDEX "ReservationSeat_id_key"
ON "ReservationSeat"("id");

CREATE TABLE "Payment" (
  "id" UUID NOT NULL,
  "reservationId" UUID NOT NULL,
  "status" "PaymentStatus" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_amountCents_nonnegative_check" CHECK ("amountCents" >= 0)
);

CREATE TABLE "Ticket" (
  "id" UUID NOT NULL,
  "reservationSeatId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "ownerId" UUID NOT NULL,
  "status" "TicketStatus" NOT NULL DEFAULT 'VALID',
  "manualCode" VARCHAR(19) NOT NULL,
  "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usedAt" TIMESTAMPTZ(3),
  "usedByGateId" UUID,

  CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Ticket_manualCode_format_check"
    CHECK ("manualCode" ~ '^[2-9A-HJKMNP-Z]{4}(-[2-9A-HJKMNP-Z]{4}){3}$'),
  CONSTRAINT "Ticket_usage_state_check"
    CHECK (
      ("status" = 'VALID' AND "usedAt" IS NULL AND "usedByGateId" IS NULL)
      OR ("status" = 'USED' AND "usedAt" IS NOT NULL AND "usedByGateId" IS NOT NULL)
    )
);

CREATE TABLE "SharedTicketLink" (
  "id" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SharedTicketLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SharedTicketLink_tokenHash_format_check"
    CHECK ("tokenHash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "Payment_reservationId_key"
ON "Payment"("reservationId");

CREATE UNIQUE INDEX "Ticket_reservationSeatId_key"
ON "Ticket"("reservationSeatId");

CREATE UNIQUE INDEX "Ticket_manualCode_key"
ON "Ticket"("manualCode");

CREATE INDEX "Ticket_ownerId_issuedAt_idx"
ON "Ticket"("ownerId", "issuedAt");

CREATE INDEX "Ticket_sessionId_status_idx"
ON "Ticket"("sessionId", "status");

CREATE UNIQUE INDEX "SharedTicketLink_ticketId_key"
ON "SharedTicketLink"("ticketId");

CREATE UNIQUE INDEX "SharedTicketLink_tokenHash_key"
ON "SharedTicketLink"("tokenHash");

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_reservationId_fkey"
FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Ticket"
ADD CONSTRAINT "Ticket_reservationSeatId_fkey"
FOREIGN KEY ("reservationSeatId") REFERENCES "ReservationSeat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Ticket"
ADD CONSTRAINT "Ticket_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Ticket"
ADD CONSTRAINT "Ticket_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Ticket"
ADD CONSTRAINT "Ticket_usedByGateId_fkey"
FOREIGN KEY ("usedByGateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SharedTicketLink"
ADD CONSTRAINT "SharedTicketLink_ticketId_fkey"
FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
