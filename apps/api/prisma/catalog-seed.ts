import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import {
  Prisma,
  ProductPricingType,
  type PrismaClient,
} from "../src/generated/prisma/client";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1800;
const MAX_IMAGE_PIXELS = 40_000_000;
const IMAGE_FILENAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MEDIA_PREFIX = "/api/v1/media/";

type JsonRecord = Record<string, unknown>;

export type CatalogSeedCategory = {
  slug: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  imageFile: string | null;
};

export type CatalogSeedProductImage = {
  imageFile: string;
  sortOrder: number;
  alt: string | null;
};

export type CatalogSeedProductVariant = {
  name: string;
  description: string | null;
  price: number;
  sortOrder: number;
  isActive: boolean;
};

export type CatalogSeedProduct = {
  slug: string;
  name: string;
  description: string;
  price: number;
  receiptPrinterIp: string | null;
  variantLabel: string | null;
  variants: CatalogSeedProductVariant[];
  sortOrder: number;
  isActive: boolean;
  categorySlug: string;
  images: CatalogSeedProductImage[];
};

export type CatalogSeedBanner = {
  title: string;
  subtitle: string | null;
  link: string | null;
  sortOrder: number;
  isActive: boolean;
  imageFile: string;
};

export type CatalogSeed = {
  exportedAt: string;
  categories: CatalogSeedCategory[];
  products: CatalogSeedProduct[];
  banners: CatalogSeedBanner[];
  normalization: {
    brandTextReplacements: number;
    placeholderBannerFieldsRemoved: number;
    externalBannerLinksRemoved: number;
  };
};

export type CatalogSeedImage = {
  filename: string;
  body: Buffer;
  width: number;
  height: number;
  bytes: number;
};

export type CatalogSeedBundle = {
  sourceDirectory: string;
  checksum: string;
  seed: CatalogSeed;
  images: CatalogSeedImage[];
};

export type CatalogSeedApplyResult = {
  categories: { created: number; updated: number; deactivated: number };
  products: { created: number; updated: number; deactivated: number };
  productVariants: { created: number; updated: number; deactivated: number };
  banners: { created: number; updated: number };
  productImages: number;
};

export type CatalogSeedApplyOptions = {
  replaceCatalog?: boolean;
};

type NormalizationCounters = CatalogSeed["normalization"];

function fail(path: string, message: string): never {
  throw new Error(`Invalid catalog seed at ${path}: ${message}`);
}

function asRecord(value: unknown, path: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "expected an object");
  }
  return value as JsonRecord;
}

function onlyKeys(
  record: JsonRecord,
  allowed: readonly string[],
  path: string,
) {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(record).filter((key) => !allowedSet.has(key));
  if (unexpected.length) {
    fail(path, `unexpected field(s): ${unexpected.join(", ")}`);
  }
}

function asArray(
  value: unknown,
  path: string,
  options: { max: number; nullable?: boolean },
) {
  if (options.nullable && value === null) return [];
  if (!Array.isArray(value)) fail(path, "expected an array");
  if (value.length > options.max) {
    fail(path, `must contain at most ${options.max} items`);
  }
  return value as unknown[];
}

function asString(
  value: unknown,
  path: string,
  maxLength: number,
  options: { nullable: true },
): string | null;
function asString(
  value: unknown,
  path: string,
  maxLength: number,
  options?: { nullable?: false },
): string;
function asString(
  value: unknown,
  path: string,
  maxLength: number,
  options: { nullable?: boolean } = {},
) {
  if (options.nullable && (value === null || value === undefined)) return null;
  if (typeof value !== "string") fail(path, "expected a string");
  const normalized = value.trim();
  if (!normalized) fail(path, "must not be empty");
  if (normalized.length > maxLength) {
    fail(path, `must be at most ${maxLength} characters`);
  }
  return normalized;
}

function asBoolean(value: unknown, path: string) {
  if (typeof value !== "boolean") fail(path, "expected a boolean");
  return value;
}

function asInteger(value: unknown, path: string) {
  if (!Number.isSafeInteger(value)) fail(path, "expected a safe integer");
  return value as number;
}

function asPrice(value: unknown, path: string) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 9_999_999_999.99 ||
    Math.round(value * 100) !== value * 100
  ) {
    fail(path, "expected a non-negative price with at most two decimal places");
  }
  return value;
}

function asPrivateLanIpv4(value: unknown, path: string) {
  const address = asString(value, path, 15, { nullable: true });
  if (address === null) return null;
  const parts = address.split(".");
  if (
    parts.length !== 4 ||
    parts.some(
      (part) =>
        !/^(?:0|[1-9]\d{0,2})$/.test(part) ||
        Number(part) < 0 ||
        Number(part) > 255,
    )
  ) {
    fail(path, "expected a private LAN IPv4 address");
  }
  const [first, second] = parts.map(Number);
  const isPrivate =
    first === 10 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31);
  if (!isPrivate) fail(path, "expected a private LAN IPv4 address");
  return address;
}

function asSlug(value: unknown, path: string) {
  const slug = asString(value, path, 180);
  if (!SLUG.test(slug)) fail(path, "contains unsupported characters");
  return slug;
}

function asImageFilename(
  value: unknown,
  path: string,
  options: { nullable: true },
): string | null;
function asImageFilename(
  value: unknown,
  path: string,
  options?: { nullable?: false },
): string;
function asImageFilename(
  value: unknown,
  path: string,
  options: { nullable?: boolean } = {},
) {
  const filename = options.nullable
    ? asString(value, path, 80, { nullable: true })
    : asString(value, path, 80);
  if (filename === null) return null;
  if (!IMAGE_FILENAME.test(filename)) {
    fail(path, "expected a UUID WebP filename without a directory");
  }
  return filename;
}

function normalizedBrandText(value: string, counters: NormalizationCounters) {
  const normalized = value.replaceAll("Saçakly", "A7-tagam");
  if (normalized !== value) counters.brandTextReplacements += 1;
  return normalized;
}

function normalizedBannerLink(
  value: unknown,
  path: string,
  counters: NormalizationCounters,
) {
  const link = asString(value, path, 1000, { nullable: true });
  if (link === null) return null;
  if (!link.startsWith("/") || link.startsWith("//")) {
    counters.externalBannerLinksRemoved += 1;
    return null;
  }
  return link;
}

function ensureUnique(values: string[], path: string) {
  const duplicate = values.find(
    (value, index) => values.indexOf(value) !== index,
  );
  if (duplicate) fail(path, `duplicate value: ${duplicate}`);
}

export function parseCatalogSeed(value: unknown): CatalogSeed {
  const root = asRecord(value, "$root");
  onlyKeys(root, ["exportedAt", "categories", "products", "banners"], "$root");

  const exportedAt = asString(root.exportedAt, "exportedAt", 64);
  if (!Number.isFinite(Date.parse(exportedAt))) {
    fail("exportedAt", "expected an ISO date-time");
  }

  const counters: NormalizationCounters = {
    brandTextReplacements: 0,
    placeholderBannerFieldsRemoved: 0,
    externalBannerLinksRemoved: 0,
  };

  const categories = asArray(root.categories, "categories", { max: 200 }).map(
    (raw, index): CatalogSeedCategory => {
      const path = `categories[${index}]`;
      const category = asRecord(raw, path);
      onlyKeys(
        category,
        ["slug", "name", "sortOrder", "isActive", "imageFile"],
        path,
      );
      return {
        slug: asSlug(category.slug, `${path}.slug`),
        name: normalizedBrandText(
          asString(category.name, `${path}.name`, 100),
          counters,
        ),
        sortOrder: asInteger(category.sortOrder, `${path}.sortOrder`),
        isActive: asBoolean(category.isActive, `${path}.isActive`),
        imageFile: asImageFilename(category.imageFile, `${path}.imageFile`, {
          nullable: true,
        }),
      };
    },
  );
  if (!categories.length) fail("categories", "must not be empty");
  ensureUnique(
    categories.map(({ slug }) => slug),
    "categories.slug",
  );
  const categorySlugs = new Set(categories.map(({ slug }) => slug));

  const products = asArray(root.products, "products", { max: 5_000 }).map(
    (raw, index): CatalogSeedProduct => {
      const path = `products[${index}]`;
      const product = asRecord(raw, path);
      onlyKeys(
        product,
        [
          "slug",
          "name",
          "description",
          "price",
          "receiptPrinterIp",
          "variantLabel",
          "variants",
          "sortOrder",
          "isActive",
          "categorySlug",
          "images",
        ],
        path,
      );
      const categorySlug = asSlug(product.categorySlug, `${path}.categorySlug`);
      if (!categorySlugs.has(categorySlug)) {
        fail(`${path}.categorySlug`, `unknown category: ${categorySlug}`);
      }
      const images = asArray(product.images, `${path}.images`, {
        max: 10,
        nullable: true,
      }).map((rawImage, imageIndex): CatalogSeedProductImage => {
        const imagePath = `${path}.images[${imageIndex}]`;
        const image = asRecord(rawImage, imagePath);
        onlyKeys(image, ["imageFile", "sortOrder", "alt"], imagePath);
        return {
          imageFile: asImageFilename(image.imageFile, `${imagePath}.imageFile`),
          sortOrder: asInteger(image.sortOrder, `${imagePath}.sortOrder`),
          alt: asString(image.alt, `${imagePath}.alt`, 180, {
            nullable: true,
          }),
        };
      });
      ensureUnique(
        images.map(({ imageFile }) => imageFile),
        `${path}.images.imageFile`,
      );
      const variants = asArray(product.variants, `${path}.variants`, {
        max: 30,
        nullable: true,
      }).map((rawVariant, variantIndex): CatalogSeedProductVariant => {
        const variantPath = `${path}.variants[${variantIndex}]`;
        const variant = asRecord(rawVariant, variantPath);
        onlyKeys(
          variant,
          ["name", "description", "price", "sortOrder", "isActive"],
          variantPath,
        );
        return {
          name: asString(variant.name, `${variantPath}.name`, 120),
          description: asString(
            variant.description,
            `${variantPath}.description`,
            300,
            { nullable: true },
          ),
          price: asPrice(variant.price, `${variantPath}.price`),
          sortOrder: asInteger(variant.sortOrder, `${variantPath}.sortOrder`),
          isActive: asBoolean(variant.isActive, `${variantPath}.isActive`),
        };
      });
      const normalizedVariantNames = variants.map(({ name }) =>
        name.toLocaleLowerCase(),
      );
      ensureUnique(normalizedVariantNames, `${path}.variants.name`);
      const variantLabel = asString(
        product.variantLabel,
        `${path}.variantLabel`,
        80,
        { nullable: true },
      );
      if (variants.length > 0 && !variantLabel) {
        fail(`${path}.variantLabel`, "is required when variants are supplied");
      }
      if (variants.length === 0 && variantLabel) {
        fail(`${path}.variantLabel`, "requires at least one variant");
      }
      if (variants.length > 0 && !variants.some(({ isActive }) => isActive)) {
        fail(`${path}.variants`, "requires at least one active variant");
      }
      return {
        slug: asSlug(product.slug, `${path}.slug`),
        name: normalizedBrandText(
          asString(product.name, `${path}.name`, 160),
          counters,
        ),
        description: normalizedBrandText(
          asString(product.description, `${path}.description`, 4000),
          counters,
        ),
        price: asPrice(product.price, `${path}.price`),
        receiptPrinterIp: asPrivateLanIpv4(
          product.receiptPrinterIp,
          `${path}.receiptPrinterIp`,
        ),
        variantLabel,
        variants,
        sortOrder: asInteger(product.sortOrder, `${path}.sortOrder`),
        isActive: asBoolean(product.isActive, `${path}.isActive`),
        categorySlug,
        images,
      };
    },
  );
  ensureUnique(
    products.map(({ slug }) => slug),
    "products.slug",
  );

  const banners = asArray(root.banners, "banners", { max: 100 }).map(
    (raw, index): CatalogSeedBanner => {
      const path = `banners[${index}]`;
      const banner = asRecord(raw, path);
      onlyKeys(
        banner,
        ["title", "subtitle", "link", "sortOrder", "isActive", "imageFile"],
        path,
      );
      const sourceTitle = asString(banner.title, `${path}.title`, 160);
      const sourceSubtitle = asString(
        banner.subtitle,
        `${path}.subtitle`,
        300,
        { nullable: true },
      );
      const isPlaceholderTitle = sourceTitle.toLowerCase() === "a";
      const isPlaceholderSubtitle = sourceSubtitle?.toLowerCase() === "a";
      if (isPlaceholderTitle) counters.placeholderBannerFieldsRemoved += 1;
      if (isPlaceholderSubtitle) counters.placeholderBannerFieldsRemoved += 1;
      return {
        title: isPlaceholderTitle
          ? "A7-tagam"
          : normalizedBrandText(sourceTitle, counters),
        subtitle: isPlaceholderSubtitle
          ? null
          : sourceSubtitle
            ? normalizedBrandText(sourceSubtitle, counters)
            : null,
        link: normalizedBannerLink(banner.link, `${path}.link`, counters),
        sortOrder: asInteger(banner.sortOrder, `${path}.sortOrder`),
        isActive: asBoolean(banner.isActive, `${path}.isActive`),
        imageFile: asImageFilename(banner.imageFile, `${path}.imageFile`),
      };
    },
  );
  ensureUnique(
    banners.map(({ imageFile }) => imageFile),
    "banners.imageFile",
  );

  return { exportedAt, categories, products, banners, normalization: counters };
}

export function referencedImageFilenames(seed: CatalogSeed) {
  return [
    ...seed.categories.flatMap(({ imageFile }) =>
      imageFile ? [imageFile] : [],
    ),
    ...seed.products.flatMap(({ images }) =>
      images.map(({ imageFile }) => imageFile),
    ),
    ...seed.banners.map(({ imageFile }) => imageFile),
  ];
}

export async function loadCatalogSeedBundle(
  sourceDirectory: string,
): Promise<CatalogSeedBundle> {
  const resolvedSource = resolve(sourceDirectory);
  const exportPath = resolve(resolvedSource, "seed_export.json");
  const imageDirectory = resolve(resolvedSource, "images");
  const exportStat = await lstat(exportPath);
  const imageDirectoryStat = await lstat(imageDirectory);
  if (!exportStat.isFile() || exportStat.isSymbolicLink()) {
    throw new Error("Catalog seed JSON must be a regular file");
  }
  if (
    !imageDirectoryStat.isDirectory() ||
    imageDirectoryStat.isSymbolicLink()
  ) {
    throw new Error("Catalog seed images must be a regular directory");
  }

  const source = await readFile(exportPath, "utf8");
  let raw: unknown;
  try {
    raw = JSON.parse(source) as unknown;
  } catch {
    throw new Error("Catalog seed JSON is invalid");
  }
  const seed = parseCatalogSeed(raw);
  const referenced = [...new Set(referencedImageFilenames(seed))];
  const expected = new Set(referenced);

  const entries = await readdir(imageDirectory, { withFileTypes: true });
  const unsafeEntry = entries.find(
    (entry) => !entry.isFile() || entry.isSymbolicLink(),
  );
  if (unsafeEntry) {
    throw new Error(`Unexpected catalog seed image entry: ${unsafeEntry.name}`);
  }
  const actual = entries.map(({ name }) => name).sort();
  const missing = [...expected].filter(
    (filename) => !actual.includes(filename),
  );
  const extra = actual.filter((filename) => !expected.has(filename));
  if (missing.length || extra.length) {
    throw new Error(
      `Catalog seed image set mismatch (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"})`,
    );
  }

  const images: CatalogSeedImage[] = [];
  for (const filename of referenced) {
    const imagePath = resolve(imageDirectory, filename);
    const stat = await lstat(imagePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Catalog seed image is not a regular file: ${filename}`);
    }
    if (stat.size <= 0 || stat.size > MAX_IMAGE_BYTES) {
      throw new Error(`Catalog seed image has an invalid size: ${filename}`);
    }
    const body = await readFile(imagePath);
    let metadata: sharp.Metadata;
    try {
      const image = sharp(body, { limitInputPixels: MAX_IMAGE_PIXELS });
      metadata = await image.metadata();
      await sharp(body, { limitInputPixels: MAX_IMAGE_PIXELS }).stats();
    } catch {
      throw new Error(`Catalog seed image content is invalid: ${filename}`);
    }
    if (
      metadata.format !== "webp" ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_IMAGE_DIMENSION ||
      metadata.height > MAX_IMAGE_DIMENSION
    ) {
      throw new Error(
        `Catalog seed image dimensions or format are invalid: ${filename}`,
      );
    }
    images.push({
      filename,
      body,
      width: metadata.width,
      height: metadata.height,
      bytes: body.length,
    });
  }

  return {
    sourceDirectory: resolvedSource,
    checksum: createHash("sha256").update(source).digest("hex"),
    seed,
    images,
  };
}

function mediaUrl(filename: string) {
  return `${MEDIA_PREFIX}${filename}`;
}

export async function applyCatalogSeed(
  prisma: PrismaClient,
  seed: CatalogSeed,
  options: CatalogSeedApplyOptions = {},
): Promise<CatalogSeedApplyResult> {
  if (options.replaceCatalog && !seed.products.length) {
    throw new Error("Catalog replacement requires at least one product");
  }
  return prisma.$transaction(
    async (tx) => {
      const categorySlugs = seed.categories.map(({ slug }) => slug);
      const productSlugs = seed.products.map(({ slug }) => slug);
      const bannerImageUrls = seed.banners.map(({ imageFile }) =>
        mediaUrl(imageFile),
      );
      const existingCategories = new Set(
        (
          await tx.category.findMany({
            where: { slug: { in: categorySlugs } },
            select: { slug: true },
          })
        ).map(({ slug }) => slug),
      );
      const existingProducts = new Set(
        (
          await tx.product.findMany({
            where: { slug: { in: productSlugs } },
            select: { slug: true },
          })
        ).map(({ slug }) => slug),
      );
      const existingBanners = new Set(
        (
          await tx.banner.findMany({
            where: { imageUrl: { in: bannerImageUrls } },
            select: { imageUrl: true },
          })
        ).map(({ imageUrl }) => imageUrl),
      );
      const deactivatedProducts = options.replaceCatalog
        ? await tx.product.updateMany({
            where: { isActive: true, slug: { notIn: productSlugs } },
            data: { isActive: false },
          })
        : { count: 0 };
      const deactivatedCategories = options.replaceCatalog
        ? await tx.category.updateMany({
            where: { isActive: true, slug: { notIn: categorySlugs } },
            data: { isActive: false },
          })
        : { count: 0 };

      const categoryIds = new Map<string, string>();
      for (const category of seed.categories) {
        const imageUrl = category.imageFile
          ? mediaUrl(category.imageFile)
          : undefined;
        const saved = await tx.category.upsert({
          where: { slug: category.slug },
          create: {
            slug: category.slug,
            name: category.name,
            sortOrder: category.sortOrder,
            isActive: category.isActive,
            imageUrl: imageUrl ?? null,
          },
          update: {
            name: category.name,
            sortOrder: category.sortOrder,
            isActive: category.isActive,
            ...(imageUrl ? { imageUrl } : {}),
          },
        });
        categoryIds.set(category.slug, saved.id);
      }

      let productImageCount = 0;
      let productVariantsCreated = 0;
      let productVariantsUpdated = 0;
      let productVariantsDeactivated = 0;
      for (const product of seed.products) {
        const categoryId = categoryIds.get(product.categorySlug);
        if (!categoryId) {
          throw new Error(`Missing category for product: ${product.slug}`);
        }
        const activeVariants = await tx.productVariant.findMany({
          where: { product: { slug: product.slug }, isActive: true },
          select: { price: true },
        });
        const importedActiveVariants = product.variants.filter(
          ({ isActive }) => isActive,
        );
        const effectivePrice = importedActiveVariants.length
          ? Math.min(...importedActiveVariants.map(({ price }) => price))
          : product.variants.length
            ? product.price
            : activeVariants.length
              ? Math.min(...activeVariants.map(({ price }) => Number(price)))
              : product.price;
        const saved = await tx.product.upsert({
          where: { slug: product.slug },
          create: {
            categoryId,
            slug: product.slug,
            name: product.name,
            description: product.description,
            pricingType: product.variants.length
              ? ProductPricingType.VARIANT
              : ProductPricingType.FIXED,
            price: effectivePrice,
            receiptPrinterIp: product.receiptPrinterIp,
            variantLabel: product.variantLabel,
            sortOrder: product.sortOrder,
            isActive: product.isActive,
          },
          update: {
            categoryId,
            name: product.name,
            description: product.description,
            price: effectivePrice,
            receiptPrinterIp: product.receiptPrinterIp,
            ...(product.variants.length
              ? {
                  pricingType: ProductPricingType.VARIANT,
                  variantLabel: product.variantLabel,
                }
              : {}),
            sortOrder: product.sortOrder,
            isActive: product.isActive,
          },
        });

        if (product.variants.length) {
          const importedVariantNames = product.variants.map(({ name }) => name);
          const existingVariants = await tx.productVariant.findMany({
            where: { productId: saved.id },
            select: { name: true },
          });
          const existingVariantNames = new Set(
            existingVariants.map(({ name }) => name),
          );
          const deactivated = await tx.productVariant.updateMany({
            where: {
              productId: saved.id,
              isActive: true,
              name: { notIn: importedVariantNames },
            },
            data: { isActive: false },
          });
          productVariantsDeactivated += deactivated.count;
          for (const variant of product.variants) {
            await tx.productVariant.upsert({
              where: {
                productId_name: { productId: saved.id, name: variant.name },
              },
              create: { productId: saved.id, ...variant },
              update: variant,
            });
            if (existingVariantNames.has(variant.name)) {
              productVariantsUpdated += 1;
            } else {
              productVariantsCreated += 1;
            }
          }
        }

        if (product.images.length) {
          await tx.productImage.deleteMany({ where: { productId: saved.id } });
          await tx.productImage.createMany({
            data: product.images.map((image) => ({
              productId: saved.id,
              url: mediaUrl(image.imageFile),
              alt: image.alt,
              sortOrder: image.sortOrder,
            })),
          });
          productImageCount += product.images.length;
        }
      }

      for (const banner of seed.banners) {
        const imageUrl = mediaUrl(banner.imageFile);
        const fields = {
          title: banner.title,
          subtitle: banner.subtitle,
          link: banner.link,
          sortOrder: banner.sortOrder,
          isActive: banner.isActive,
          imageUrl,
        };
        const existing = await tx.banner.findFirst({ where: { imageUrl } });
        if (existing) {
          await tx.banner.update({ where: { id: existing.id }, data: fields });
        } else {
          await tx.banner.create({ data: fields });
        }
      }

      await tx.auditLog.create({
        data: {
          action: "catalog.seed.imported",
          entityType: "CatalogSeed",
          entityId: seed.exportedAt,
          metadata: {
            exportedAt: seed.exportedAt,
            categories: seed.categories.length,
            products: seed.products.length,
            productImages: productImageCount,
            productVariantsCreated,
            productVariantsUpdated,
            productVariantsDeactivated,
            banners: seed.banners.length,
            replaceCatalog: options.replaceCatalog ?? false,
            deactivatedCategories: deactivatedCategories.count,
            deactivatedProducts: deactivatedProducts.count,
            normalization: seed.normalization,
          },
        },
      });

      return {
        categories: {
          created: seed.categories.length - existingCategories.size,
          updated: existingCategories.size,
          deactivated: deactivatedCategories.count,
        },
        products: {
          created: seed.products.length - existingProducts.size,
          updated: existingProducts.size,
          deactivated: deactivatedProducts.count,
        },
        productVariants: {
          created: productVariantsCreated,
          updated: productVariantsUpdated,
          deactivated: productVariantsDeactivated,
        },
        banners: {
          created: seed.banners.length - existingBanners.size,
          updated: existingBanners.size,
        },
        productImages: productImageCount,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 60_000,
    },
  );
}
