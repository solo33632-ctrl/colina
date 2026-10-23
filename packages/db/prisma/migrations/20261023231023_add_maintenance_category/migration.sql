-- AlterTable
ALTER TABLE "MaintenanceShowcase" ADD COLUMN     "categoryId" TEXT;

-- CreateTable
CREATE TABLE "MaintenanceCategory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MaintenanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceCategory_slug_key" ON "MaintenanceCategory"("slug");

-- CreateIndex
CREATE INDEX "MaintenanceShowcase_categoryId_idx" ON "MaintenanceShowcase"("categoryId");

-- AddForeignKey
ALTER TABLE "MaintenanceShowcase" ADD CONSTRAINT "MaintenanceShowcase_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MaintenanceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
