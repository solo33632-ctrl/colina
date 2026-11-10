-- Stage 2c: durable rate-limit buckets.
--
-- New table only (purely additive): one row per hashed limiter key and fixed
-- window start, with the hit count for that window. The limiter's single
-- INSERT ... ON CONFLICT ... RETURNING statement is the only writer.
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key", "windowStart")
);
