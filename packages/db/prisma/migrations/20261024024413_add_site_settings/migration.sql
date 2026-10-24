-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "whatsappNumber" TEXT,
    "whatsappMessageEn" TEXT,
    "whatsappMessageAr" TEXT,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);
