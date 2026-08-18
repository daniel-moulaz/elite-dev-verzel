CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED');

CREATE TABLE "Reservation" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "totalCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Reservation_totalCents_nonnegative_check" CHECK ("totalCents" >= 0)
);

CREATE TABLE "ReservationSeat" (
  "reservationId" UUID NOT NULL,
  "seatId" UUID NOT NULL,
  "unitPriceCents" INTEGER NOT NULL,

  CONSTRAINT "ReservationSeat_pkey" PRIMARY KEY ("reservationId", "seatId"),
  CONSTRAINT "ReservationSeat_unitPriceCents_nonnegative_check" CHECK ("unitPriceCents" >= 0)
);

CREATE INDEX "Reservation_customerId_createdAt_idx"
ON "Reservation"("customerId", "createdAt");

CREATE INDEX "Reservation_sessionId_status_expiresAt_idx"
ON "Reservation"("sessionId", "status", "expiresAt");

CREATE UNIQUE INDEX "ReservationSeat_seatId_key"
ON "ReservationSeat"("seatId");

ALTER TABLE "Reservation"
ADD CONSTRAINT "Reservation_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Reservation"
ADD CONSTRAINT "Reservation_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReservationSeat"
ADD CONSTRAINT "ReservationSeat_reservationId_fkey"
FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReservationSeat"
ADD CONSTRAINT "ReservationSeat_seatId_fkey"
FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
