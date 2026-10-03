-- No initial policy: publishing this schema alone must not block mobile users.
CREATE TABLE "AppVersion" (
    "platform" "PushDevicePlatform" NOT NULL,
    "latestVersion" VARCHAR(32) NOT NULL,
    "minSupportedVersion" VARCHAR(32) NOT NULL,
    "storeUrl" VARCHAR(2048) NOT NULL,
    "releaseNotesRu" VARCHAR(5000),
    "releaseNotesTk" VARCHAR(5000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppVersion_pkey" PRIMARY KEY ("platform")
);
