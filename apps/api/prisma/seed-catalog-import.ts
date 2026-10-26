import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  ProductPricingType,
} from "../src/generated/prisma/client";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

// Imports a catalogue (cafes, categories, products, variants and their images)
// from JSON and image files the operator saved under prisma/seed-data/a7/.
// The files are local-only input (git-ignored). This script never makes a
// network request to any other installation; it only reads those files, writes
// to the local `sacakly` database and uploads the images to local MinIO.
//
//   prisma/seed-data/a7/cafes.json
//   prisma/seed-data/a7/categories.json
//   prisma/seed-data/a7/products.json
//   prisma/seed-data/a7/images/<uuid>.webp
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
  throw new Error(
    "Catalogue import is allowed only in the local sacakly database",
  );
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

const dataDir = resolve(__dirname, "seed-data/a7");
const imageDir = resolve(dataDir, "images");

type Image = {
  id?: string;
  url: string;
  alt?: string | null;
  sortOrder?: number;
};
type Variant = {
  name: string;
  description?: string | null;
  price: number;
  isActive: boolean;
  sortOrder: number;
  images?: Image[] | null;
};
type SourceCafe = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
};
type SourceCategory = {
  id: string;
  cafeId: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
};
type SourceProduct = {
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  pricingType: "FIXED" | "VARIANT";
  price: number;
  preparationMinutes: number;
  loyaltyPoints: number;
  variantLabel?: string | null;
  isActive: boolean;
  sortOrder: number;
  images?: Image[];
  variants?: Variant[];
  displayImageUrl?: string | null;
};

async function readJson<T>(name: string): Promise<T> {
  const file = resolve(dataDir, name);
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    throw new Error(
      `Cannot read ${file}. Save the catalogue JSON there first.`,
      { cause: error },
    );
  }
}

const mediaName =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

async function main() {
  const [cafes, categories, products] = await Promise.all([
    readJson<SourceCafe[]>("cafes.json"),
    readJson<SourceCategory[]>("categories.json"),
    readJson<SourceProduct[]>("products.json"),
  ]);

  let available = new Set<string>();
  try {
    available = new Set(
      (await readdir(imageDir)).filter((name) => mediaName.test(name)),
    );
  } catch {
    console.warn(`No images folder at ${imageDir}; importing without images.`);
  }

  // Only images that are referenced and present on disk are linked, so the
  // database never points at a file that was not uploaded.
  const missing = new Set<string>();
  const used = new Set<string>();
  const mediaUrl = (source?: string | null): string | null => {
    if (!source) return null;
    const name = basename(source);
    if (!mediaName.test(name) || !available.has(name)) {
      missing.add(name);
      return null;
    }
    used.add(name);
    return `/api/v1/media/${name}`;
  };

  const orderedCafes = [...cafes]
    .filter((cafe) => cafe.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const cafeIds = new Map<string, string>();
  for (const [index, cafe] of orderedCafes.entries()) {
    const cafeImage = mediaUrl(cafe.imageUrl);
    const row = await prisma.cafe.upsert({
      where: { slug: cafe.slug },
      create: {
        name: cafe.name,
        slug: cafe.slug,
        description: cafe.description ?? null,
        imageUrl: cafeImage,
        sortOrder: cafe.sortOrder,
        isActive: true,
      },
      update: {
        name: cafe.name,
        description: cafe.description ?? null,
        ...(cafeImage ? { imageUrl: cafeImage } : {}),
        sortOrder: cafe.sortOrder,
        isActive: true,
      },
    });
    cafeIds.set(cafe.id, row.id);
    await prisma.cafeModuleEntitlement.upsert({
      where: { cafeId_key: { cafeId: row.id, key: "ORDERING" } },
      create: { cafeId: row.id, key: "ORDERING", enabled: true },
      update: { enabled: true },
    });
    // Same branch ids as the local demo seed, so both can run on one database.
    const branchId = `00000000-0000-4000-8000-${String(200 + index).padStart(12, "0")}`;
    await prisma.branch.upsert({
      where: { id: branchId },
      create: {
        id: branchId,
        cafeId: row.id,
        name: `${cafe.name} · Aşgabat`,
        address: "Aşgabat",
        latitude: 37.9601 + index * 0.004,
        longitude: 58.3261 + index * 0.004,
        isActive: true,
      },
      update: { cafeId: row.id, isActive: true },
    });
  }

  const categoryIds = new Map<string, string>();
  for (const category of categories) {
    const cafeId = cafeIds.get(category.cafeId);
    if (!cafeId || !category.isActive) continue;
    const categoryImage = mediaUrl(category.imageUrl);
    const data = {
      cafeId,
      name: category.name,
      sortOrder: category.sortOrder,
      isActive: true,
    };
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      create: { ...data, slug: category.slug, imageUrl: categoryImage },
      // Keep an existing image when this run could not find the file.
      update: {
        ...data,
        ...(categoryImage ? { imageUrl: categoryImage } : {}),
      },
    });
    categoryIds.set(category.id, row.id);
  }

  let importedProducts = 0;
  let importedVariants = 0;
  for (const product of products) {
    const categoryId = categoryIds.get(product.categoryId);
    if (!categoryId || !product.isActive) continue;
    const variants = (product.variants ?? []).filter((v) => v.isActive);
    const data = {
      categoryId,
      name: product.name,
      description: product.description,
      pricingType:
        product.pricingType === "VARIANT" && variants.length > 0
          ? ProductPricingType.VARIANT
          : ProductPricingType.FIXED,
      price: product.price,
      preparationMinutes: product.preparationMinutes,
      loyaltyPoints: product.loyaltyPoints,
      variantLabel: product.variantLabel ?? null,
      sortOrder: product.sortOrder,
      isActive: true,
    };
    const row = await prisma.product.upsert({
      where: { slug: product.slug },
      create: { ...data, slug: product.slug },
      update: data,
    });

    // Rebuilt on every run, so re-running never duplicates gallery rows.
    const gallery = [...(product.images ?? [])]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .flatMap((image, index) => {
        const link = mediaUrl(image.url);
        return link
          ? [
              {
                productId: row.id,
                url: link,
                alt: image.alt ?? null,
                sortOrder: index,
              },
            ]
          : [];
      });
    if (gallery.length === 0) {
      const cover = mediaUrl(product.displayImageUrl);
      if (cover)
        gallery.push({
          productId: row.id,
          url: cover,
          alt: null,
          sortOrder: 0,
        });
    }
    // Only replaced when this run found images, so a run without the image
    // folder leaves any existing gallery alone.
    if (gallery.length > 0) {
      await prisma.productImage.deleteMany({ where: { productId: row.id } });
      await prisma.productImage.createMany({ data: gallery });
    }

    for (const variant of variants) {
      const variantRow = await prisma.productVariant.upsert({
        where: { productId_name: { productId: row.id, name: variant.name } },
        create: {
          productId: row.id,
          name: variant.name,
          description: variant.description ?? null,
          price: variant.price,
          sortOrder: variant.sortOrder,
          isActive: true,
        },
        update: {
          description: variant.description ?? null,
          price: variant.price,
          sortOrder: variant.sortOrder,
          isActive: true,
        },
      });
      const variantImages = [...(variant.images ?? [])]
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .flatMap((image, index) => {
          const link = mediaUrl(image.url);
          return link
            ? [
                {
                  productVariantId: variantRow.id,
                  url: link,
                  alt: image.alt ?? null,
                  sortOrder: index,
                },
              ]
            : [];
        });
      if (variantImages.length > 0) {
        await prisma.productVariantImage.deleteMany({
          where: { productVariantId: variantRow.id },
        });
        await prisma.productVariantImage.createMany({ data: variantImages });
      }
      importedVariants += 1;
    }
    importedProducts += 1;
  }

  // Upload the images that ended up linked, a few at a time.
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
    const queue = [...used];
    const worker = async () => {
      for (let name = queue.pop(); name; name = queue.pop()) {
        await media.send(
          new PutObjectCommand({
            Bucket: process.env.S3_BUCKET || "sacakly-media",
            Key: `images/${name}`,
            Body: await readFile(resolve(imageDir, name)),
            ContentType: "image/webp",
            CacheControl: "public, max-age=31536000, immutable",
          }),
        );
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
  } finally {
    media.destroy();
  }

  console.log(
    `Catalogue imported: ${cafeIds.size} cafes, ${categoryIds.size} categories, ` +
      `${importedProducts} products, ${importedVariants} variants, ` +
      `${used.size} images uploaded` +
      (missing.size > 0
        ? `, ${missing.size} referenced images not found on disk`
        : ""),
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
