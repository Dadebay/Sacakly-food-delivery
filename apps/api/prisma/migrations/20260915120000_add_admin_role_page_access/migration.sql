CREATE TYPE "AdminPage" AS ENUM (
  'LOGIN_ATTEMPTS',
  'ORDERS',
  'MEAL_CONFIG',
  'ACCOUNTING',
  'COURIER_MAP',
  'BRANCHES',
  'DELIVERY',
  'CATALOG',
  'MARKETING',
  'NOTIFICATIONS',
  'STAFF',
  'CONTACTS',
  'APP_VERSIONS'
);

CREATE TABLE "AdminRolePageAccess" (
  "role" "Role" NOT NULL,
  "allowedPages" "AdminPage"[] NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdminRolePageAccess_pkey" PRIMARY KEY ("role")
);
