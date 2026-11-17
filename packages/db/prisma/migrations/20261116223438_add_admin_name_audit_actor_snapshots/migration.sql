-- Stage 4b: admin accounts management + audit that survives account deletion.
--
-- Purely additive. `AdminUser.name` is nullable because accounts that predate
-- this stage have no recorded display name; the UI shows an em-dash for them.
--
-- `AuditLog.actorEmail` / `actorName` are point-in-time snapshots of the actor.
-- The existing `adminUserId` FK stays nullable with ON DELETE SET NULL, so a
-- deleted account detaches its rows without deleting or blocking them. The
-- snapshots are what keep those rows readable.
ALTER TABLE "AdminUser" ADD COLUMN     "name" TEXT;

ALTER TABLE "AuditLog" ADD COLUMN     "actorEmail" TEXT,
ADD COLUMN     "actorName" TEXT;

-- Backfill existing rows from the live account they still point at. This runs
-- before any account is deleted, so every currently-attributed row gets its
-- actor's email; the name is NULL for all pre-existing accounts by design.
UPDATE "AuditLog" AS a
SET "actorEmail" = u."email",
    "actorName" = u."name"
FROM "AdminUser" AS u
WHERE a."adminUserId" = u."id";

CREATE INDEX "AuditLog_actorEmail_idx" ON "AuditLog"("actorEmail");
