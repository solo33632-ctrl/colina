-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "nameAr" TEXT,
ADD COLUMN     "nameEn" TEXT,
ADD COLUMN     "websiteUrl" TEXT;
