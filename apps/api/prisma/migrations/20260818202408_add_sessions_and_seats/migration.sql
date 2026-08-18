-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "organizerId" UUID NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "venueName" VARCHAR(120) NOT NULL,
    "roomName" VARCHAR(80) NOT NULL,
    "address" VARCHAR(240) NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "tmdbMovieId" INTEGER NOT NULL,
    "movieTitle" VARCHAR(240) NOT NULL,
    "movieOverview" TEXT NOT NULL,
    "moviePosterPath" VARCHAR(255),
    "movieBackdropPath" VARCHAR(255),
    "movieReleaseDate" DATE,
    "movieRuntimeMinutes" INTEGER,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seat" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "rowLabel" VARCHAR(1) NOT NULL,
    "number" SMALLINT NOT NULL,
    "label" VARCHAR(3) NOT NULL,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_status_startsAt_idx" ON "Session"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Session_organizerId_startsAt_idx" ON "Session"("organizerId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_sessionId_label_key" ON "Seat"("sessionId", "label");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
