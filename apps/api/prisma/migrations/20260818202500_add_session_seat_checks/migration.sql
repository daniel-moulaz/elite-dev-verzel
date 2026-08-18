ALTER TABLE "Session"
ADD CONSTRAINT "Session_priceCents_nonnegative_check"
CHECK ("priceCents" >= 0),
ADD CONSTRAINT "Session_tmdbMovieId_positive_check"
CHECK ("tmdbMovieId" > 0),
ADD CONSTRAINT "Session_movieRuntimeMinutes_positive_check"
CHECK ("movieRuntimeMinutes" IS NULL OR "movieRuntimeMinutes" > 0),
ADD CONSTRAINT "Session_publication_state_check"
CHECK (
  ("status" = 'DRAFT' AND "publishedAt" IS NULL)
  OR ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL)
);

ALTER TABLE "Seat"
ADD CONSTRAINT "Seat_rowLabel_range_check"
CHECK ("rowLabel" ~ '^[A-J]$'),
ADD CONSTRAINT "Seat_number_range_check"
CHECK ("number" BETWEEN 1 AND 20),
ADD CONSTRAINT "Seat_label_consistency_check"
CHECK ("label" = "rowLabel" || "number"::text);
