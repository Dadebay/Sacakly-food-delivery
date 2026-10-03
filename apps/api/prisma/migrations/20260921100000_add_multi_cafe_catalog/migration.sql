CREATE TABLE "Cafe" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "description" VARCHAR(1000),
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cafe_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Cafe" (
    "id",
    "name",
    "slug",
    "description",
    "sortOrder",
    "isActive",
    "createdAt",
    "updatedAt"
)
VALUES
    (
        '00000000-0000-4000-8000-000000000010',
        'Han tagam',
        'han-tagam',
        'Основное кафе Han tagam',
        0,
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        '00000000-0000-4000-8000-000000000011',
        'Panda',
        'panda',
        'Кафе Panda',
        10,
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    );

ALTER TABLE "Category"
ADD COLUMN "cafeId" UUID NOT NULL
DEFAULT '00000000-0000-4000-8000-000000000010';

-- Preserve the established category order while splitting the current menu
-- between two editable cafes. For an odd count, Han tagam receives one extra.
WITH ranked_categories AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (ORDER BY "sortOrder", "name", "id") AS position,
        COUNT(*) OVER () AS total
    FROM "Category"
)
UPDATE "Category" AS category
SET "cafeId" = '00000000-0000-4000-8000-000000000011'
FROM ranked_categories AS ranked
WHERE category."id" = ranked."id"
  AND ranked.position > (ranked.total + 1) / 2;

CREATE UNIQUE INDEX "Cafe_slug_key" ON "Cafe"("slug");
CREATE INDEX "Cafe_isActive_sortOrder_idx" ON "Cafe"("isActive", "sortOrder");
CREATE INDEX "Category_cafeId_isActive_sortOrder_idx"
ON "Category"("cafeId", "isActive", "sortOrder");

ALTER TABLE "Category"
ADD CONSTRAINT "Category_cafeId_fkey"
FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
