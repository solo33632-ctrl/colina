-- Stage 2b: revocable admin sessions.
--
-- Purely additive: existing rows receive 0, and every JWT issued before this
-- migration has no `sessionVersion` claim and is therefore treated as
-- revoked (one forced re-login).
ALTER TABLE "AdminUser" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
