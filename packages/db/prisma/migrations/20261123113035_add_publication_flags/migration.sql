-- AlterTable
ALTER TABLE "Machine" ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "MachineCategory" ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Machine_isPublished_idx" ON "Machine"("isPublished");

-- CreateIndex
CREATE INDEX "MachineCategory_isPublished_idx" ON "MachineCategory"("isPublished");
