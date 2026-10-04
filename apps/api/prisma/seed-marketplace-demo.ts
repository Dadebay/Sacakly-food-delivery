import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const url = process.env.DATABASE_URL ?? "postgresql://sacakly:sacakly@localhost:5432/sacakly?schema=public";
const target = new URL(url);
if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "5432" || target.pathname !== "/sacakly") {
  throw new Error("Demo seed is allowed only in the local sacakly database");
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const cafes = [
  { name: "Güneş Naharlary", slug: "gunes-naharlary", description: "Öý tagamlary we ýyly naharlar", product: "Palow", price: 45, prep: 45 },
  { name: "Nar Tagam", slug: "nar-tagam", description: "Möwsümleýin tagamlar, her gün täze", product: "Manty", price: 38, prep: 60 },
  { name: "Ýaprak Café", slug: "yaprak-cafe", description: "Ýeňil nahar we kofe üçin", product: "Sandwiç", price: 32, prep: 20 },
];
async function main() {
  for (const [index, entry] of cafes.entries()) {
    const cafe = await prisma.cafe.upsert({ where: { slug: entry.slug }, create: { name: entry.name, slug: entry.slug, description: entry.description, sortOrder: index }, update: { name: entry.name, description: entry.description, isActive: true } });
    await prisma.cafeModuleEntitlement.upsert({ where: { cafeId_key: { cafeId: cafe.id, key: "ORDERING" } }, create: { cafeId: cafe.id, key: "ORDERING", enabled: true }, update: { enabled: true } });
    const branchId = `00000000-0000-4000-8000-${String(200 + index).padStart(12, "0")}`;
    await prisma.branch.upsert({ where: { id: branchId }, create: { id: branchId, cafeId: cafe.id, name: `${entry.name} · Aşgabat`, address: "Aşgabat", latitude: 37.9601 + index * 0.004, longitude: 58.3261 + index * 0.004, isActive: true }, update: { cafeId: cafe.id, isActive: true } });
    const category = await prisma.category.upsert({ where: { slug: `${entry.slug}-main` }, create: { cafeId: cafe.id, name: "Esasy tagamlar", slug: `${entry.slug}-main` }, update: { cafeId: cafe.id, isActive: true } });
    await prisma.product.upsert({ where: { slug: `${entry.slug}-dish` }, create: { categoryId: category.id, name: entry.product, slug: `${entry.slug}-dish`, description: entry.description, price: entry.price, preparationMinutes: entry.prep }, update: { categoryId: category.id, name: entry.product, price: entry.price, preparationMinutes: entry.prep, isActive: true } });
  }
  for (const [locale, title, description] of [
    ["tk", "Aşgabadyň tagamlary, bir ýerde.", "Ýakyn kafeleri saýlaň we nahary göni web saýtyndan sargyt ediň."],
    ["ru", "Вкус Ашхабада — рядом.", "Выбирайте местные кафе и заказывайте любимые блюда прямо на сайте."],
    ["en", "A taste of Ashgabat, nearby.", "Choose local cafes and order your favourites right from the website."],
  ] as const) {
    await prisma.sitePage.upsert({ where: { locale_slug: { locale, slug: "home" } }, create: { locale, slug: "home", title, description, body: "", published: true }, update: {} });
  }
  console.log("Local Saçakly marketplace demo is ready");
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
