import "dotenv/config";
import {
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  applyCatalogSeed,
  loadCatalogSeedBundle,
  type CatalogSeedImage,
} from "./catalog-seed";

const CACHE_CONTROL = "public, max-age=31536000, immutable";

type CliOptions = { source: string; apply: boolean; replaceCatalog: boolean };

function parseOptions(argv: string[]): CliOptions {
  let source: string | undefined;
  let apply = false;
  let replaceCatalog = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      apply = true;
      continue;
    }
    if (argument === "--replace-catalog") {
      replaceCatalog = true;
      continue;
    }
    if (argument === "--source") {
      source = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument?.startsWith("--source=")) {
      source = argument.slice("--source=".length);
      continue;
    }
    throw new Error(`Unknown catalog seed option: ${argument ?? ""}`);
  }
  if (!source) throw new Error("Use --source <directory> for the seed package");
  return { source, apply, replaceCatalog };
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function createS3Client() {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
    throw new Error("S3 access key ID and secret must be configured together");
  }
  const config: S3ClientConfig = {
    region: process.env.S3_REGION?.trim() || "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  };
  if (endpoint) config.endpoint = endpoint;
  if (accessKeyId && secretAccessKey) {
    config.credentials = { accessKeyId, secretAccessKey };
  }
  return new S3Client(config);
}

async function uploadImages(
  client: S3Client,
  bucket: string,
  images: CatalogSeedImage[],
) {
  const concurrency = 4;
  for (let index = 0; index < images.length; index += concurrency) {
    await Promise.all(
      images.slice(index, index + concurrency).map((image) =>
        client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: `images/${image.filename}`,
            Body: image.body,
            ContentType: "image/webp",
            CacheControl: CACHE_CONTROL,
          }),
        ),
      ),
    );
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const bundle = await loadCatalogSeedBundle(options.source);
  const summary = {
    exportedAt: bundle.seed.exportedAt,
    checksum: bundle.checksum,
    categories: bundle.seed.categories.length,
    products: bundle.seed.products.length,
    banners: bundle.seed.banners.length,
    images: bundle.images.length,
    imageBytes: bundle.images.reduce((sum, image) => sum + image.bytes, 0),
    normalization: bundle.seed.normalization,
    replaceCatalog: options.replaceCatalog,
  };

  if (!options.apply) {
    console.log(JSON.stringify({ mode: "dry-run", ...summary }, null, 2));
    return;
  }

  const databaseUrl = requiredEnv("DATABASE_URL");
  const bucket = requiredEnv("S3_BUCKET");
  const s3 = createS3Client();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    await uploadImages(s3, bucket, bundle.images);
    const result = await applyCatalogSeed(prisma, bundle.seed, {
      replaceCatalog: options.replaceCatalog,
    });
    console.log(
      JSON.stringify({ mode: "applied", ...summary, result }, null, 2),
    );
  } finally {
    s3.destroy();
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Catalog seed failed");
  process.exitCode = 1;
});
