import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyCatalogSeed,
  loadCatalogSeedBundle,
  parseCatalogSeed,
} from "../prisma/catalog-seed";
import {
  PrismaClient,
  ProductPricingType,
} from "../src/generated/prisma/client";

function rawSeed(
  options: {
    categorySlug?: string;
    productSlug?: string;
    imageFile?: string;
    exportedAt?: string;
  } = {},
) {
  const categorySlug = options.categorySlug ?? "seed-category";
  const imageFile =
    options.imageFile ?? "11111111-1111-4111-8111-111111111111.webp";
  return {
    exportedAt: options.exportedAt ?? "2026-08-18T09:22:03.498Z",
    categories: [
      {
        slug: categorySlug,
        name: "Бургеры",
        sortOrder: 10,
        isActive: true,
        imageFile,
      },
    ],
    products: [
      {
        slug: options.productSlug ?? "alowalow-burger",
        name: "AlowAlow Burger",
        description: "Говяжья котлета",
        price: 48,
        receiptPrinterIp: "192.168.123.100",
        variantLabel: null,
        variants: [],
        sortOrder: 0,
        isActive: true,
        categorySlug,
        images: [{ imageFile, sortOrder: 0, alt: null }],
      },
    ],
    banners: [
      {
        title: "a",
        subtitle: "a",
        link: "https://example.com/foreign",
        sortOrder: 0,
        isActive: true,
        imageFile,
      },
    ],
  };
}

describe("catalog seed", () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  beforeAll(async () => prisma.$connect());
  afterAll(async () => prisma.$disconnect());

  it("normalizes legacy brand text, placeholder banner fields and nullable images", () => {
    const raw = rawSeed();
    raw.products[0]!.images = null as never;
    const seed = parseCatalogSeed(raw);

    expect(seed.products[0]).toMatchObject({
      name: "A7-tagam Burger",
      receiptPrinterIp: "192.168.123.100",
      images: [],
    });
    expect(seed.banners[0]).toMatchObject({
      title: "A7-tagam",
      subtitle: null,
      link: null,
    });
    expect(seed.normalization).toEqual({
      brandTextReplacements: 1,
      placeholderBannerFieldsRemoved: 2,
      externalBannerLinksRemoved: 1,
    });
  });

  it("rejects malformed and public receipt-printer addresses", () => {
    const malformed = rawSeed();
    malformed.products[0]!.receiptPrinterIp = "192.168.1.999";
    expect(() => parseCatalogSeed(malformed)).toThrow(/private LAN IPv4/);

    const publicAddress = rawSeed();
    publicAddress.products[0]!.receiptPrinterIp = "8.8.8.8";
    expect(() => parseCatalogSeed(publicAddress)).toThrow(/private LAN IPv4/);
  });

  it("requires a selector label for imported variants", () => {
    const raw = rawSeed();
    raw.products[0]!.variants = [
      {
        name: "Большая",
        description: null,
        price: 65,
        sortOrder: 0,
        isActive: true,
      },
    ];
    expect(() => parseCatalogSeed(raw)).toThrow(/variantLabel.*required/);
  });

  it("requires at least one active imported variant", () => {
    const raw = rawSeed();
    raw.products[0]!.variantLabel = "Размер";
    raw.products[0]!.variants = [
      {
        name: "Скрытый",
        description: null,
        price: 65,
        sortOrder: 0,
        isActive: false,
      },
    ];
    expect(() => parseCatalogSeed(raw)).toThrow(/active variant/);
  });

  it("rejects unknown fields, unsafe image names and missing category relations", () => {
    expect(() => parseCatalogSeed({ ...rawSeed(), unexpected: true })).toThrow(
      /unexpected field/,
    );

    const unsafe = rawSeed();
    unsafe.products[0]!.images[0]!.imageFile = "../image.webp";
    expect(() => parseCatalogSeed(unsafe)).toThrow(/UUID WebP filename/);

    const missingCategory = rawSeed();
    missingCategory.products[0]!.categorySlug = "not-imported";
    expect(() => parseCatalogSeed(missingCategory)).toThrow(/unknown category/);
  });

  it("validates the complete JSON and WebP file set before applying", async () => {
    const directory = await mkdtemp(join(tmpdir(), "a7-catalog-seed-"));
    try {
      const imageFile = `${randomUUID()}.webp`;
      const raw = rawSeed({ imageFile });
      const body = await sharp({
        create: {
          width: 64,
          height: 64,
          channels: 3,
          background: "#f77a18",
        },
      })
        .webp()
        .toBuffer();
      await mkdir(join(directory, "images"));
      await writeFile(join(directory, "seed_export.json"), JSON.stringify(raw));
      await writeFile(join(directory, "images", imageFile), body);

      const bundle = await loadCatalogSeedBundle(directory);
      expect(bundle.images).toHaveLength(1);
      expect(bundle.images[0]).toMatchObject({
        filename: imageFile,
        width: 64,
        height: 64,
      });

      await writeFile(join(directory, "images", `${randomUUID()}.webp`), body);
      await expect(loadCatalogSeedBundle(directory)).rejects.toThrow(
        /image set mismatch/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("applies idempotently, preserves variants and records an audit event", async () => {
    const suffix = randomUUID();
    const categorySlug = `seed-category-${suffix}`;
    const productSlug = `seed-product-${suffix}`;
    const imageFile = `${randomUUID()}.webp`;
    const exportedAt = new Date().toISOString();
    const seed = parseCatalogSeed(
      rawSeed({ categorySlug, productSlug, imageFile, exportedAt }),
    );
    const imageUrl = `/api/v1/media/${imageFile}`;

    try {
      const first = await applyCatalogSeed(prisma, seed);
      expect(first).toMatchObject({
        categories: { created: 1, updated: 0 },
        products: { created: 1, updated: 0 },
        banners: { created: 1, updated: 0 },
        productImages: 1,
      });

      const product = await prisma.product.findUniqueOrThrow({
        where: { slug: productSlug },
      });
      await prisma.product.update({
        where: { id: product.id },
        data: {
          pricingType: ProductPricingType.VARIANT,
          variantLabel: "Размер",
        },
      });
      await prisma.productVariant.create({
        data: {
          productId: product.id,
          name: "Большая",
          price: 65,
          isActive: true,
        },
      });

      const second = await applyCatalogSeed(prisma, seed);
      expect(second).toMatchObject({
        categories: { created: 0, updated: 1 },
        products: { created: 0, updated: 1 },
        banners: { created: 0, updated: 1 },
        productImages: 1,
      });

      const saved = await prisma.product.findUniqueOrThrow({
        where: { slug: productSlug },
        include: { images: true, variants: true },
      });
      expect(Number(saved.price)).toBe(65);
      expect(saved.name).toBe("A7-tagam Burger");
      expect(saved.pricingType).toBe(ProductPricingType.VARIANT);
      expect(saved.receiptPrinterIp).toBe("192.168.123.100");
      expect(saved.images).toHaveLength(1);
      expect(saved.variants).toHaveLength(1);
      expect(
        await prisma.auditLog.count({
          where: { action: "catalog.seed.imported", entityId: exportedAt },
        }),
      ).toBe(2);
      expect(await prisma.banner.count({ where: { imageUrl } })).toBe(1);
    } finally {
      await prisma.auditLog.deleteMany({
        where: { action: "catalog.seed.imported", entityId: exportedAt },
      });
      await prisma.banner.deleteMany({ where: { imageUrl } });
      await prisma.product.deleteMany({ where: { slug: productSlug } });
      await prisma.category.deleteMany({ where: { slug: categorySlug } });
    }
  });

  it("imports explicit variants idempotently and deactivates omitted options", async () => {
    const suffix = randomUUID();
    const categorySlug = `variant-category-${suffix}`;
    const productSlug = `variant-product-${suffix}`;
    const exportedAt = new Date().toISOString();
    const raw = rawSeed({ categorySlug, productSlug, exportedAt });
    raw.products[0]!.variantLabel = "Размер";
    raw.products[0]!.variants = [
      {
        name: "Маленькая",
        description: null,
        price: 48,
        sortOrder: 0,
        isActive: true,
      },
      {
        name: "Большая",
        description: null,
        price: 65,
        sortOrder: 1,
        isActive: true,
      },
    ];
    const firstSeed = parseCatalogSeed(raw);

    try {
      const first = await applyCatalogSeed(prisma, firstSeed);
      expect(first.productVariants).toEqual({
        created: 2,
        updated: 0,
        deactivated: 0,
      });
      const firstSaved = await prisma.product.findUniqueOrThrow({
        where: { slug: productSlug },
        include: { variants: { orderBy: { sortOrder: "asc" } } },
      });
      expect(Number(firstSaved.price)).toBe(48);
      expect(firstSaved).toMatchObject({
        pricingType: ProductPricingType.VARIANT,
        variantLabel: "Размер",
        variants: [
          { name: "Маленькая", isActive: true },
          { name: "Большая", isActive: true },
        ],
      });

      raw.products[0]!.variants = [
        {
          name: "Большая",
          description: null,
          price: 70,
          sortOrder: 0,
          isActive: true,
        },
      ];
      const second = await applyCatalogSeed(prisma, parseCatalogSeed(raw));
      expect(second.productVariants).toEqual({
        created: 0,
        updated: 1,
        deactivated: 1,
      });
      const secondSaved = await prisma.product.findUniqueOrThrow({
        where: { slug: productSlug },
        include: { variants: { orderBy: { name: "asc" } } },
      });
      expect(Number(secondSaved.price)).toBe(70);
      expect(secondSaved).toMatchObject({
        variants: [
          { name: "Большая", isActive: true },
          { name: "Маленькая", isActive: false },
        ],
      });
    } finally {
      await prisma.auditLog.deleteMany({
        where: { action: "catalog.seed.imported", entityId: exportedAt },
      });
      await prisma.banner.deleteMany({
        where: { imageUrl: `/api/v1/media/${raw.banners[0]!.imageFile}` },
      });
      await prisma.product.deleteMany({ where: { slug: productSlug } });
      await prisma.category.deleteMany({ where: { slug: categorySlug } });
    }
  });

  it("atomically deactivates catalog records omitted from an explicit replacement", async () => {
    const suffix = randomUUID();
    const keptCategorySlug = `kept-category-${suffix}`;
    const keptProductSlug = `kept-product-${suffix}`;
    const oldCategorySlug = `old-category-${suffix}`;
    const oldProductSlug = `old-product-${suffix}`;
    const seed = parseCatalogSeed(
      rawSeed({
        categorySlug: keptCategorySlug,
        productSlug: keptProductSlug,
        exportedAt: new Date().toISOString(),
      }),
    );
    const activeCategoryIds = (
      await prisma.category.findMany({
        where: { isActive: true },
        select: { id: true },
      })
    ).map(({ id }) => id);
    const activeProductIds = (
      await prisma.product.findMany({
        where: { isActive: true },
        select: { id: true },
      })
    ).map(({ id }) => id);

    try {
      const oldCategory = await prisma.category.create({
        data: { name: "Старое меню", slug: oldCategorySlug },
      });
      await prisma.product.create({
        data: {
          categoryId: oldCategory.id,
          name: "Старое блюдо",
          slug: oldProductSlug,
          description: "Историческая позиция",
          price: 10,
        },
      });

      const result = await applyCatalogSeed(prisma, seed, {
        replaceCatalog: true,
      });

      expect(result.categories.deactivated).toBeGreaterThanOrEqual(1);
      expect(result.products.deactivated).toBeGreaterThanOrEqual(1);
      await expect(
        prisma.category.findUniqueOrThrow({ where: { slug: oldCategorySlug } }),
      ).resolves.toMatchObject({ isActive: false });
      await expect(
        prisma.product.findUniqueOrThrow({ where: { slug: oldProductSlug } }),
      ).resolves.toMatchObject({ isActive: false });
      await expect(
        prisma.product.findUniqueOrThrow({ where: { slug: keptProductSlug } }),
      ).resolves.toMatchObject({
        isActive: true,
        receiptPrinterIp: "192.168.123.100",
      });
    } finally {
      await prisma.auditLog.deleteMany({
        where: { action: "catalog.seed.imported", entityId: seed.exportedAt },
      });
      await prisma.banner.deleteMany({
        where: { imageUrl: `/api/v1/media/${seed.banners[0]!.imageFile}` },
      });
      await prisma.product.deleteMany({
        where: { slug: { in: [keptProductSlug, oldProductSlug] } },
      });
      await prisma.category.deleteMany({
        where: { slug: { in: [keptCategorySlug, oldCategorySlug] } },
      });
      await prisma.category.updateMany({
        where: { id: { in: activeCategoryIds } },
        data: { isActive: true },
      });
      await prisma.product.updateMany({
        where: { id: { in: activeProductIds } },
        data: { isActive: true },
      });
    }
  });
});
