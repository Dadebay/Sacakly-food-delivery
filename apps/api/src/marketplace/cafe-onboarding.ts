import { ConflictException } from "@nestjs/common";
import { Role, type Prisma } from "../generated/prisma/client";

export const CAFE_CUISINES = [
  "SUSHI", "BURGERS", "FAST_FOOD", "PIZZA", "TURKMEN", "BAKERY", "COFFEE", "OTHER",
] as const;
export type CafeCuisine = (typeof CAFE_CUISINES)[number];

export async function cafeReadiness(db: Prisma.TransactionClient, cafeId: string) {
  const [cafe, managers, branches, products, receiptConfig] = await Promise.all([
    db.cafe.findUnique({ where: { id: cafeId }, select: { isActive: true, cuisines: true } }),
    db.cafeMembership.count({ where: { cafeId, isActive: true, role: Role.ADMIN, user: { isActive: true } } }),
    db.branch.count({ where: { cafeId, isActive: true } }),
    db.product.count({ where: { isActive: true, category: { cafeId, isActive: true } } }),
    db.cafeReceiptConfiguration.findUnique({ where: { cafeId }, select: { agentTokenHash: true, mainPrinter: { select: { isActive: true, cafeId: true } } } }),
  ]);
  if (!cafe) return null;
  const checks = {
    cuisine: cafe.cuisines.length > 0,
    manager: managers > 0,
    branch: branches > 0,
    menu: products > 0,
  };
  return {
    cafeId,
    active: cafe.isActive,
    checks,
    readyForOrdering: cafe.isActive && Object.values(checks).every(Boolean),
    receiptsConfigured: Boolean(receiptConfig?.agentTokenHash && receiptConfig.mainPrinter?.isActive && receiptConfig.mainPrinter.cafeId === cafeId),
  };
}

// Serialize publication and changes that can remove required setup data. A cafe
// row lock prevents two concurrent removals from each seeing the other's row.
export async function lockCafeSetup(db: Prisma.TransactionClient, cafeId: string) {
  await db.$queryRaw`SELECT "id" FROM "Cafe" WHERE "id" = ${cafeId}::uuid FOR UPDATE`;
  return cafeReadiness(db, cafeId);
}

export async function assertPublishedCafeReady(db: Prisma.TransactionClient, cafeId: string, before: Awaited<ReturnType<typeof cafeReadiness>>) {
  const ordering = await db.cafeModuleEntitlement.findUnique({ where: { cafeId_key: { cafeId, key: "ORDERING" } }, select: { enabled: true } });
  if (!ordering?.enabled || !before) return;
  const after = await cafeReadiness(db, cafeId);
  const checks = Object.keys(before.checks) as Array<keyof typeof before.checks>;
  // Imported already-enabled cafes may need several steps to reach readiness.
  // Permit improvements while preventing removal of any existing requirement.
  if (!after || (before.active && !after.active) || checks.some((key) => before.checks[key] && !after.checks[key])) {
    throw new ConflictException("Disable ordering before removing the last cuisine, cafe administrator, active branch or menu item");
  }
}
