CREATE TABLE "AdminUserPageAccess" (
    "userId" UUID NOT NULL,
    "allowedPages" "AdminPage"[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUserPageAccess_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "AdminUserPageAccess"
ADD CONSTRAINT "AdminUserPageAccess_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve any role-wide choices made before access became employee-specific.
INSERT INTO "AdminUserPageAccess" ("userId", "allowedPages", "version", "updatedAt")
SELECT u."id", p."allowedPages", 1, CURRENT_TIMESTAMP
FROM "User" u
JOIN "AdminRolePageAccess" p ON p."role" = u."role"
WHERE u."role" NOT IN ('CUSTOMER', 'SUPER_ADMIN')
ON CONFLICT ("userId") DO NOTHING;
