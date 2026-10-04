import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  ProductPricingType,
  PromoType,
  Role,
} from "../src/generated/prisma/client";
import {
  DEFAULT_CAFE_ID,
  INITIAL_SECONDARY_CAFE_ID,
} from "../src/catalog/catalog.constants";

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://sacakly:sacakly@localhost:5432/sacakly?schema=public",
});
const prisma = new PrismaClient({ adapter });

const staff = [
  {
    phone: "+99365000000",
    firstName: "A7-tagam",
    lastName: "Owner",
    role: Role.SUPER_ADMIN,
  },
  {
    phone: "+99365000001",
    firstName: "Merdan",
    lastName: "Admin",
    role: Role.ADMIN,
  },
  {
    phone: "+99365000002",
    firstName: "Aýna",
    lastName: "Operator",
    role: Role.OPERATOR,
  },
  {
    phone: "+99365000003",
    firstName: "Batyr",
    lastName: "Aşpez",
    role: Role.COOK,
  },
  {
    phone: "+99365000004",
    firstName: "Maksat",
    lastName: "Kurýer",
    role: Role.COURIER,
  },
  {
    phone: "+99365000005",
    firstName: "Oguljan",
    lastName: "Hasapçy",
    role: Role.ACCOUNTANT,
  },
];

async function main() {
  for (const member of staff) {
    await prisma.user.upsert({
      where: { phone: member.phone },
      create: member,
      update: {
        firstName: member.firstName,
        lastName: member.lastName,
        role: member.role,
        isActive: true,
      },
    });
  }

  await prisma.branch.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "A7-tagam Demo",
      address: "Ashgabat (local demo)",
      latitude: 37.9601,
      longitude: 58.3261,
      isPrimary: true,
    },
    update: {
      name: "A7-tagam Demo",
      address: "Ashgabat (local demo)",
      latitude: 37.9601,
      longitude: 58.3261,
      isActive: true,
      isPrimary: true,
    },
  });

  await prisma.cafe.upsert({
    where: { id: DEFAULT_CAFE_ID },
    create: {
      id: DEFAULT_CAFE_ID,
      name: "Han tagam",
      slug: "han-tagam",
      description: "Основное кафе Han tagam",
      sortOrder: 0,
      isActive: true,
    },
    update: {
      name: "Han tagam",
      slug: "han-tagam",
      isActive: true,
    },
  });

  await prisma.cafe.upsert({
    where: { id: INITIAL_SECONDARY_CAFE_ID },
    create: {
      id: INITIAL_SECONDARY_CAFE_ID,
      name: "Panda",
      slug: "panda",
      description: "Кафе Panda",
      sortOrder: 10,
      isActive: true,
    },
    update: {
      name: "Panda",
      slug: "panda",
    },
  });

  const burgers = await prisma.category.upsert({
    where: { slug: "burgers" },
    create: {
      cafeId: DEFAULT_CAFE_ID,
      name: "Бургеры",
      slug: "burgers",
      sortOrder: 10,
    },
    update: { name: "Бургеры", isActive: true },
  });
  const pizza = await prisma.category.upsert({
    where: { slug: "pizza" },
    create: {
      cafeId: DEFAULT_CAFE_ID,
      name: "Пицца",
      slug: "pizza",
      sortOrder: 20,
    },
    update: { name: "Пицца", isActive: true },
  });
  const turkmenCuisine = await prisma.category.upsert({
    where: { slug: "turkmen-yemekleri" },
    create: {
      cafeId: DEFAULT_CAFE_ID,
      name: "Türkmen yemekleri",
      slug: "turkmen-yemekleri",
      sortOrder: 30,
    },
    update: {
      name: "Türkmen yemekleri",
      sortOrder: 30,
      isActive: true,
    },
  });
  const extraCategories = [
    { name: "Salatlar", slug: "salatlar", sortOrder: 40 },
    { name: "Çorbalar", slug: "corbalar", sortOrder: 50 },
    { name: "Kebaplar", slug: "kebaplar", sortOrder: 60 },
    { name: "Tiz tagamlar", slug: "tiz-tagamlar", sortOrder: 70 },
    { name: "Süýjülikler", slug: "suyjulikler", sortOrder: 80 },
    { name: "Ertirlik", slug: "ertirlik", sortOrder: 90 },
    { name: "Içgiler", slug: "icgiler", sortOrder: 100 },
  ];
  const categoryIds = new Map<string, string>([
    ["burgers", burgers.id],
    ["pizza", pizza.id],
    ["turkmen-yemekleri", turkmenCuisine.id],
  ]);

  for (const [index, category] of extraCategories.entries()) {
    const savedCategory = await prisma.category.upsert({
      where: { slug: category.slug },
      create: {
        ...category,
        cafeId: index < 2 ? DEFAULT_CAFE_ID : INITIAL_SECONDARY_CAFE_ID,
      },
      update: { ...category, isActive: true },
    });
    categoryIds.set(category.slug, savedCategory.id);
  }

  await prisma.product.updateMany({
    where: { slug: "alo-burger" },
    data: { name: "A7-tagam Burger", slug: "sacakly-burger" },
  });
  await prisma.product.upsert({
    where: { slug: "sacakly-burger" },
    create: {
      categoryId: burgers.id,
      name: "A7-tagam Burger",
      slug: "sacakly-burger",
      description: "Говяжья котлета, чеддер, свежие овощи и фирменный соус.",
      price: 48,
    },
    update: {
      categoryId: burgers.id,
      name: "A7-tagam Burger",
      description: "Говяжья котлета, чеддер, свежие овощи и фирменный соус.",
      price: 48,
      isActive: true,
    },
  });
  const margherita = await prisma.product.upsert({
    where: { slug: "margherita" },
    create: {
      categoryId: pizza.id,
      name: "Маргарита",
      slug: "margherita",
      description: "Томаты, моцарелла и базилик на тонком тесте.",
      pricingType: ProductPricingType.VARIANT,
      price: 65,
      variantLabel: "Размер",
    },
    update: {
      categoryId: pizza.id,
      pricingType: ProductPricingType.VARIANT,
      price: 65,
      variantLabel: "Размер",
      isActive: true,
    },
  });
  for (const [sortOrder, variant] of [
    { name: "Маленькая, 25 см", price: 65 },
    { name: "Средняя, 30 см", price: 85 },
    { name: "Большая, 35 см", price: 105 },
  ].entries()) {
    await prisma.productVariant.upsert({
      where: {
        productId_name: {
          productId: margherita.id,
          name: variant.name,
        },
      },
      create: {
        productId: margherita.id,
        ...variant,
        sortOrder,
      },
      update: {
        price: variant.price,
        sortOrder,
        isActive: true,
      },
    });
  }

  const turkmenProducts = [
    {
      name: "Palaw",
      slug: "palaw",
      description: "Et, tüwi, käşir we ysly zatlar bilen taýýarlanan milli palaw.",
      price: 85,
      sortOrder: 10,
    },
    {
      name: "Etli manty",
      slug: "etli-manty",
      description: "Ownuk dogralan et we sogan bilen bugda bişirilen manty.",
      price: 70,
      sortOrder: 20,
    },
    {
      name: "Dograma",
      slug: "dograma",
      description: "Çörek, et çorbasy we sogan bilen taýýarlanan milli tagam.",
      price: 75,
      sortOrder: 30,
    },
    {
      name: "Fitçi",
      slug: "fitci",
      description: "Etli içlik bilen taýýarlanan, tandyrda bişirilen fitçi.",
      price: 55,
      sortOrder: 40,
    },
    {
      name: "Etli gutap",
      slug: "etli-gutap",
      description: "Etli içlikli, gyzgyn saçda bişirilen inçe gutap.",
      price: 35,
      sortOrder: 50,
    },
  ];

  for (const product of turkmenProducts) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      create: { ...product, categoryId: turkmenCuisine.id },
      update: {
        ...product,
        categoryId: turkmenCuisine.id,
        isActive: true,
      },
    });
  }

  const additionalProducts = [
    ["burgers", "Çizburger", "cizburger", "Şireli sygyr eti, peýnir we gök önümler bilen burger.", 52],
    ["burgers", "Towuk burger", "towuk-burger", "Çişikli towuk eti we täze gök önümler bilen burger.", 46],
    ["burgers", "Açyk burger", "acyk-burger", "Ajy sously sygyr eti we peýnir bilen burger.", 55],
    ["burgers", "Iki gat burger", "iki-gat-burger", "Iki sygyr etli kotlet we iki gat peýnirli burger.", 68],
    ["pizza", "Pepperoni", "pepperoni", "Pepperoni, mozzarella we pomidor sously pizza.", 78],
    ["pizza", "Towukly pizza", "towukly-pizza", "Towuk eti, kömelek we peýnirli pizza.", 75],
    ["pizza", "Dört peýnir", "dort-peynir", "Dört dürli peýnirli ýumşak pizza.", 82],
    ["pizza", "Gök önümlikli pizza", "gok-onumlikli-pizza", "Gök önümler, mozarella we ysly otlar bilen pizza.", 70],
    ["salatlar", "Sezar salady", "sezar-salady", "Towuk eti, aysberg, parmezan we Sezar sousy.", 48],
    ["salatlar", "Grek salady", "grek-salady", "Pomidor, hyýar, peýnir we zeýtunly ýeňil salat.", 42],
    ["salatlar", "Açyk salat", "acyk-salat", "Täze gök önümler we ajy sous bilen salat.", 38],
    ["salatlar", "Towukly salat", "towukly-salat", "Grill towuk eti we täze gök önümler bilen salat.", 52],
    ["salatlar", "Winaigret", "winaigret", "Şugundyr, kartoşka we gök önümler bilen öý salady.", 35],
    ["corbalar", "Et çorbasy", "et-corbasy", "Sygyr eti we gök önümler bilen gyzgyn çorba.", 45],
    ["corbalar", "Towuk çorbasy", "towuk-corbasy", "Towuk eti, nahar we gök önümler bilen çorba.", 40],
    ["corbalar", "Mercimek çorbasy", "mercimek-corbasy", "Mercimekden taýýarlanan goýy we ýyly çorba.", 35],
    ["corbalar", "Kömelek çorbasy", "komelek-corbasy", "Gaýmakly kömelek çorbasy.", 42],
    ["corbalar", "Lagman çorbasy", "lagman-corbasy", "Nahar, et we gök önümler bilen lagman çorbasy.", 55],
    ["kebaplar", "Şaşlyk", "saslyk", "Kömürde bişirilen şireli sygyr etinden şaşlyk.", 90],
    ["kebaplar", "Towuk kebap", "towuk-kebap", "Grill edilen ýumşak towuk kebaby.", 75],
    ["kebaplar", "Lýulýa kebap", "lyulya-kebap", "Ysly zatlar goşulan ownuk etden kebap.", 80],
    ["kebaplar", "Ganatly towuk", "ganatly-towuk", "Ajy-myşty sousda bişirilen towuk ganatlary.", 62],
    ["kebaplar", "Grill gök önümler", "grill-gok-onumler", "Grill edilen baklajan, burç we beýleki gök önümler.", 50],
    ["tiz-tagamlar", "Fri kartoşka", "fri-kartoska", "Çişikli duzly fri kartoşka.", 25],
    ["tiz-tagamlar", "Nagetler", "nagetler", "Alty bölek çişikli towuk nagetleri.", 42],
    ["tiz-tagamlar", "Hot-dog", "hot-dog", "Sosiska, sous we gök önümler bilen hot-dog.", 32],
    ["tiz-tagamlar", "Klab sendwiç", "klab-sendwic", "Towuk eti, peýnir we gök önümler bilen üç gatly sendwiç.", 55],
    ["tiz-tagamlar", "Soğan halkasy", "sogan-halkasy", "Çişikli bişirilen sogan halkalary.", 28],
    ["suyjulikler", "Çizkeyk", "cizkeyk", "Gaýmakly peýnirli näzik tort.", 38],
    ["suyjulikler", "Şokoladly tort", "sokoladly-tort", "Goýy şokoladly we biskwitli tort.", 42],
    ["suyjulikler", "Ballı tort", "bally-tort", "Ýumşak koržlar we bally gaýmakly tort.", 40],
    ["suyjulikler", "Dondurma", "dondurma", "Soňky tagam üçin vanilli dondurma.", 25],
    ["suyjulikler", "Syrnik", "syrnik", "Gaýmak bilen berilýän süzme peýnirli syrnik.", 35],
    ["ertirlik", "Omlet", "omlet", "Peýnir we gök önümler bilen ýumşak omlet.", 35],
    ["ertirlik", "Ýumurtga we kolbasa", "yumurtga-kolbasa", "Iki sany gowrulan ýumurtga we kolbasa.", 38],
    ["ertirlik", "Blincik", "blincik", "Gaýmak ýa-da bal bilen berilýän blincikler.", 32],
    ["ertirlik", "Kruassan", "kruassan", "Ýagly we çişikli täze bişen kruassan.", 28],
    ["ertirlik", "Süýtli süle", "sytli-sule", "Miwe bölekleri bilen ýyly süle.", 30],
    ["icgiler", "Kola", "kola", "0.5 litr sowuk kola.", 15],
    ["icgiler", "Aýran", "ayran", "Sowuk, salkynlatýan milli aýran.", 18],
    ["icgiler", "Gök çaý", "gok-cay", "Täze demlenen yssy gök çaý.", 12],
    ["icgiler", "Limonad", "limonad", "Täze limonly we nanaly öý limonady.", 22],
    ["icgiler", "Apelsin şiresi", "apelsin-siresi", "Tebigy apelsin şiresi.", 25],
  ] as const;

  for (const [categorySlug, name, slug, description, price] of additionalProducts) {
    const categoryId = categoryIds.get(categorySlug);
    if (!categoryId) throw new Error(`Missing category: ${categorySlug}`);

    await prisma.product.upsert({
      where: { slug },
      create: { categoryId, name, slug, description, price, sortOrder: 10 },
      update: { categoryId, name, description, price, isActive: true },
    });
  }

  await prisma.promoCode.upsert({
    where: { code: "WELCOME15" },
    create: {
      code: "WELCOME15",
      type: PromoType.PERCENT,
      value: 15,
      minOrderAmount: 80,
      maxDiscountAmount: 35,
      perUserLimit: 1,
    },
    update: { isActive: true },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
