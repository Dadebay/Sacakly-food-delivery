import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "../src/generated/prisma/client";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

// Matches the bundled demo menu in the former food_delivery Flutter app.
// This seed is intentionally local-only and never reads the former production API.
const url =
  process.env.DATABASE_URL ??
  "postgresql://sacakly:sacakly@localhost:5432/sacakly?schema=public";
const target = new URL(url);
if (
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.port !== "5432" ||
  target.pathname !== "/sacakly"
) {
  throw new Error("Demo seed is allowed only in the local sacakly database");
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

const cafes = [
  {
    name: "Han tagam",
    slug: "han-tagam",
    cuisines: ["TURKMEN"],
    categories: [
      {
        id: "plov",
        name: "Плов",
        dishes: [
          [
            "plov-ashgabat",
            "Плов по-ашхабадски",
            "Рис, баранина, морковь, айва — на казане, с бараньим жиром.",
            45,
            35,
          ],
          [
            "plov-chicken",
            "Плов с курицей",
            "Более лёгкий вариант плова — рис, куриное бедро, зира.",
            38,
            30,
          ],
          [
            "lagman",
            "Лагман",
            "Тянутая лапша, говядина, овощи, наваристый бульон.",
            40,
            25,
          ],
        ],
      },
      {
        id: "shashlyk",
        name: "Шашлык",
        dishes: [
          [
            "shashlyk-beef",
            "Шашлык из говядины",
            "Маринованная говяжья вырезка на углях, подаётся с луком.",
            62,
            25,
          ],
          [
            "shashlyk-lamb",
            "Шашлык из баранины",
            "Классика — курдючная баранина, минимум специй.",
            68,
            25,
          ],
        ],
      },
      {
        id: "somsa",
        name: "Самса",
        dishes: [
          [
            "somsa-meat",
            "Мясная самса",
            "Слоёное тесто, рубленая баранина, лук, специи. Выпекается в тандыре.",
            32,
            20,
          ],
        ],
      },
      {
        id: "bread",
        name: "Выпечка",
        dishes: [
          [
            "churek",
            "Тандырный чурек",
            "Свежая выпечка из тандыра, подаётся горячим.",
            9,
            0,
          ],
          [
            "byorek-meat",
            "Мясной бёрек",
            "Тонкое тесто со слоями рубленого мяса, запечённое до корочки.",
            15,
            30,
          ],
        ],
      },
    ],
  },
  {
    name: "Panda",
    slug: "panda",
    cuisines: ["FAST_FOOD"],
    categories: [
      {
        id: "salads",
        name: "Салаты",
        dishes: [
          [
            "salad-merjen",
            "Салат «Мерджен»",
            "Свежие овощи, зелень, лёгкая заправка.",
            24,
            0,
          ],
          [
            "dograma",
            "Дограма",
            "Традиционное туркменское блюдо — чурек, мясо, лук на бульоне.",
            38,
            15,
          ],
        ],
      },
      {
        id: "drinks",
        name: "Напитки",
        dishes: [
          ["ayran", "Айран", "Холодный кисломолочный напиток.", 5, 0],
          [
            "tea-green",
            "Чай зелёный",
            "Подаётся горячим, в чайнике на двоих.",
            9,
            0,
          ],
          ["compote", "Компот", "Домашний компот из сухофруктов.", 8, 0],
        ],
      },
    ],
  },
] as const;

async function main() {
  const products = new Map<
    string,
    { id: string; name: string; price: number; preparationMinutes: number }
  >();
  const seededCafes = new Map<
    string,
    {
      id: string;
      branchId: string;
      branchName: string;
      branchAddress: string;
      latitude: number;
      longitude: number;
    }
  >();
  for (const [cafeIndex, entry] of cafes.entries()) {
    const cafe = await prisma.cafe.upsert({
      where: { slug: entry.slug },
      create: {
        name: entry.name,
        slug: entry.slug,
        cuisines: [...entry.cuisines],
        sortOrder: cafeIndex,
      },
      update: {
        name: entry.name,
        cuisines: [...entry.cuisines],
        isActive: true,
      },
    });
    await prisma.cafeModuleEntitlement.upsert({
      where: { cafeId_key: { cafeId: cafe.id, key: "ORDERING" } },
      create: { cafeId: cafe.id, key: "ORDERING", enabled: true },
      update: { enabled: true },
    });
    const branchId = `00000000-0000-4000-8000-${String(200 + cafeIndex).padStart(12, "0")}`;
    const branch = await prisma.branch.upsert({
      where: { id: branchId },
      create: {
        id: branchId,
        cafeId: cafe.id,
        name: `${entry.name} · Aşgabat`,
        address: "Aşgabat",
        latitude: 37.9601 + cafeIndex * 0.004,
        longitude: 58.3261 + cafeIndex * 0.004,
        isActive: true,
      },
      update: { cafeId: cafe.id, isActive: true },
    });
    seededCafes.set(entry.slug, {
      id: cafe.id,
      branchId: branch.id,
      branchName: branch.name,
      branchAddress: branch.address,
      latitude: Number(branch.latitude),
      longitude: Number(branch.longitude),
    });
    for (const [categoryIndex, categoryEntry] of entry.categories.entries()) {
      const category = await prisma.category.upsert({
        where: { slug: `${entry.slug}-${categoryEntry.id}` },
        create: {
          cafeId: cafe.id,
          name: categoryEntry.name,
          slug: `${entry.slug}-${categoryEntry.id}`,
          sortOrder: categoryIndex,
        },
        update: { cafeId: cafe.id, name: categoryEntry.name, isActive: true },
      });
      for (const [
        productIndex,
        [slug, name, description, price, preparationMinutes],
      ] of categoryEntry.dishes.entries()) {
        const product = await prisma.product.upsert({
          where: { slug: `sacakly-demo-${slug}` },
          create: {
            categoryId: category.id,
            name,
            slug: `sacakly-demo-${slug}`,
            description,
            price,
            preparationMinutes,
            sortOrder: productIndex,
          },
          update: {
            categoryId: category.id,
            name,
            description,
            price,
            preparationMinutes,
            isActive: true,
          },
        });
        products.set(slug, {
          id: product.id,
          name: product.name,
          price: Number(product.price),
          preparationMinutes: product.preparationMinutes,
        });
      }
    }
  }

  // Reuse artwork already bundled with the former app. Fixed media names and
  // banner IDs make the local seed repeatable without creating extra records.
  const media = new S3Client({
    endpoint: process.env.S3_ENDPOINT || "http://127.0.0.1:9000",
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "sacakly",
      secretAccessKey:
        process.env.S3_SECRET_ACCESS_KEY || "sacakly-local-secret",
    },
  });
  try {
    for (const [index, entry] of cafes.entries()) {
      const cafe = seededCafes.get(entry.slug)!;
      const filename = `00000000-0000-4000-8000-${String(501 + index).padStart(12, "0")}.webp`;
      const source = resolve(
        __dirname,
        `../../customer/assets/onboard${index + 1}.png`,
      );
      const image = await sharp(await readFile(source))
        .resize(1800, 1800, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 84 })
        .toBuffer();
      await media.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET || "sacakly-media",
          Key: `images/${filename}`,
          Body: image,
          ContentType: "image/webp",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      await prisma.banner.upsert({
        where: {
          id: `00000000-0000-4000-8000-${String(401 + index).padStart(12, "0")}`,
        },
        create: {
          id: `00000000-0000-4000-8000-${String(401 + index).padStart(12, "0")}`,
          title: index === 0 ? "Geleneksel lezzetler" : "Bugün ne yiyelim?",
          subtitle: `${entry.name} menüsünü keşfet`,
          imageUrl: `/api/v1/media/${filename}`,
          link: `app://cafe/${cafe.id}`,
          sortOrder: index,
          isActive: true,
        },
        update: {},
      });
    }
  } finally {
    media.destroy();
  }

  const demoUsers = [
    {
      phone: "+99365000001",
      firstName: "Demo",
      lastName: "Müşteri",
      role: Role.CUSTOMER,
    },
    {
      phone: "+99365000002",
      firstName: "Demo",
      lastName: "Admin",
      role: Role.ADMIN,
    },
    {
      phone: "+99365000003",
      firstName: "Örnek",
      lastName: "Müşteri",
      role: Role.CUSTOMER,
    },
  ] as const;
  const users = new Map<string, string>();
  for (const entry of demoUsers) {
    const user = await prisma.user.upsert({
      where: { phone: entry.phone },
      create: entry,
      update: {},
    });
    if (user.role !== entry.role) {
      throw new Error(
        `Demo phone ${entry.phone} already belongs to a different role`,
      );
    }
    users.set(entry.phone, user.id);
  }

  const adminId = users.get("+99365000002")!;
  for (const cafe of seededCafes.values()) {
    await prisma.cafeMembership.upsert({
      where: { cafeId_userId: { cafeId: cafe.id, userId: adminId } },
      create: { cafeId: cafe.id, userId: adminId, role: Role.ADMIN },
      update: {},
    });
  }

  const sampleOrders = [
    {
      id: "00000000-0000-4000-8000-000000000301",
      cafe: "han-tagam",
      customer: "+99365000001",
      dish: "plov-ashgabat",
      quantity: 1,
    },
    {
      id: "00000000-0000-4000-8000-000000000302",
      cafe: "panda",
      customer: "+99365000001",
      dish: "salad-merjen",
      quantity: 2,
    },
    {
      id: "00000000-0000-4000-8000-000000000303",
      cafe: "han-tagam",
      customer: "+99365000003",
      dish: "shashlyk-beef",
      quantity: 1,
    },
  ] as const;
  for (const [index, entry] of sampleOrders.entries()) {
    const cafe = seededCafes.get(entry.cafe)!;
    const product = products.get(entry.dish)!;
    const subtotal = product.price * entry.quantity;
    const deliveryFee = 10;
    await prisma.order.upsert({
      where: { id: entry.id },
      update: {},
      create: {
        id: entry.id,
        cafeId: cafe.id,
        customerId: users.get(entry.customer)!,
        branchId: cafe.branchId,
        subtotal,
        deliveryFee,
        total: subtotal + deliveryFee,
        address: `Demo adres ${index + 1}, Aşgabat`,
        latitude: 37.96 + index * 0.003,
        longitude: 58.33 + index * 0.003,
        branchName: cafe.branchName,
        branchAddress: cafe.branchAddress,
        branchLatitude: cafe.latitude,
        branchLongitude: cafe.longitude,
        customerNote: "Yalnızca yerel test verisi",
        items: {
          create: [
            {
              cafeId: cafe.id,
              productId: product.id,
              productName: product.name,
              preparationMinutes: product.preparationMinutes,
              unitPrice: product.price,
              quantity: entry.quantity,
              lineTotal: subtotal,
            },
          ],
        },
      },
    });
  }
  console.log(
    "Local demo ready: 2 cafes, 13 dishes, 2 banners, 3 users, 3 sample orders",
  );
}
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
