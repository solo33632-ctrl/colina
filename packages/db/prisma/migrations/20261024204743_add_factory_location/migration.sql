-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "factoryAddressAr" TEXT,
ADD COLUMN     "factoryAddressEn" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "mapsUrl" TEXT,
ADD COLUMN     "workingHoursAr" TEXT,
ADD COLUMN     "workingHoursEn" TEXT;
