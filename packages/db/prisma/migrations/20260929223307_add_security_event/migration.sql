-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM ('RATE_LIMITED', 'HONEYPOT_CAUGHT', 'LOGIN_FAILED');

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "type" "SecurityEventType" NOT NULL,
    "source" TEXT NOT NULL,
    "ip" TEXT,
    "detail" TEXT,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_type_idx" ON "SecurityEvent"("type");
