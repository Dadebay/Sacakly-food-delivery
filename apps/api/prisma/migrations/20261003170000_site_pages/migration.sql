CREATE TABLE "SitePage" (
  "locale" VARCHAR(2) NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" VARCHAR(300) NOT NULL,
  "body" TEXT NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedById" UUID,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SitePage_pkey" PRIMARY KEY ("locale", "slug")
);
CREATE INDEX "SitePage_published_locale_idx" ON "SitePage"("published", "locale");
