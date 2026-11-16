-- Stage 4a: creator ownership for machines and machine categories.
--
-- Purely additive: both columns are nullable, so every pre-existing row keeps
-- NULL ("not owned by an editor") and no data is rewritten. `ON DELETE SET
-- NULL` means deleting an admin account never deletes the content it created.
ALTER TABLE "Machine" ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "MachineCategory" ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "Machine_createdById_idx" ON "Machine"("createdById");

-- CreateIndex
CREATE INDEX "MachineCategory_createdById_idx" ON "MachineCategory"("createdById");

-- AddForeignKey
ALTER TABLE "MachineCategory" ADD CONSTRAINT "MachineCategory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
