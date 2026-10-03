ALTER TABLE "Branch" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- Existing installations receive a deterministic fallback until an admin
-- explicitly chooses another main branch.
UPDATE "Branch"
SET "isPrimary" = true
WHERE "id" = (
  SELECT "id"
  FROM "Branch"
  WHERE "isActive" = true
  ORDER BY "createdAt" ASC, "id" ASC
  LIMIT 1
);
