CREATE TABLE "ContactSettings" (
    "id" VARCHAR(40) NOT NULL DEFAULT 'default',
    "telegram" VARCHAR(500),
    "displayName" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(24) NOT NULL,
    "email" VARCHAR(254),
    "privacyLink" VARCHAR(1000),
    "userAgreementLink" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactSettings_pkey" PRIMARY KEY ("id")
);
INSERT INTO "ContactSettings" ("id", "displayName", "phone") VALUES ('default', 'AloWAlow Destek', '+99312000000');
