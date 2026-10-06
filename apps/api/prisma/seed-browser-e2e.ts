import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "../src/generated/prisma/client";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://sacakly:sacakly@localhost:5432/sacakly_test";
const target = new URL(databaseUrl);
if (
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.port !== "5432" ||
  target.pathname !== "/sacakly_test" ||
  process.env.NODE_ENV === "production"
) {
  throw new Error(
    "Browser E2E fixtures may only use the local sacakly_test database",
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

export async function seedBrowserE2e() {
  try {
    const merchant = await prisma.user.create({
      data: {
        phone: "+99365000991",
        firstName: "E2E manager",
        role: Role.CUSTOMER,
      },
    });
    const customer = await prisma.user.create({ data: { phone: "+99365000990", role: Role.CUSTOMER } });
    for (const [index, entry] of [
      {
        name: "E2E Güneş",
        slug: "e2e-gunes",
        product: "E2E Palow",
        preparationMinutes: 45,
      },
      {
        name: "E2E Nar",
        slug: "e2e-nar",
        product: "E2E Manty",
        preparationMinutes: 60,
      },
    ].entries()) {
      const cafe = await prisma.cafe.create({
        data: { name: entry.name, slug: entry.slug, sortOrder: index, cuisines: index === 0 ? ["TURKMEN"] : ["FAST_FOOD"] },
      });
      // Existing balances exercise cafe isolation; actual earning/refund is
      // verified through HTTP in cafe-rewards.e2e.spec.ts.
      await prisma.cafeLoyaltyWallet.create({ data: { cafeId: cafe.id, userId: customer.id, balance: index === 0 ? 99 : 10 } });
      await prisma.cafeModuleEntitlement.create({
        data: { cafeId: cafe.id, key: "ORDERING", enabled: true },
      });
      await prisma.branch.create({
        data: {
          cafeId: cafe.id,
          name: `${entry.name} kitchen`,
          address: "Aşgabat",
          latitude: 37.96,
          longitude: 58.33,
        },
      });
      const category = await prisma.category.create({
        data: {
          cafeId: cafe.id,
          name: "Main dishes",
          slug: `${entry.slug}-main`,
        },
      });
      await prisma.product.create({
        data: {
          categoryId: category.id,
          name: entry.product,
          slug: `${entry.slug}-dish`,
          description: "Browser test meal",
          price: index === 0 ? 45 : 38,
          preparationMinutes: entry.preparationMinutes,
          loyaltyPoints: 5,
        },
      });
      if (index === 1) {
        await prisma.cafeMembership.create({
          data: { cafeId: cafe.id, userId: merchant.id, role: Role.ADMIN },
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
