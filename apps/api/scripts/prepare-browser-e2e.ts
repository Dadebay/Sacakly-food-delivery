import { setup } from "../test/global-setup";
import { seedBrowserE2e } from "../prisma/seed-browser-e2e";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://sacakly:sacakly@localhost:5432/sacakly_test";
const target = new URL(databaseUrl);
const admin = new URL(
  process.env.TEST_DATABASE_ADMIN_URL ??
    "postgresql://sacakly:sacakly@localhost:5432/sacakly",
);
const redis = new URL(
  process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15",
);
const local = (url: URL, port: string) =>
  ["localhost", "127.0.0.1"].includes(url.hostname) && url.port === port;
if (
  !local(target, "5432") ||
  target.pathname !== "/sacakly_test" ||
  !local(admin, "5432") ||
  admin.pathname !== "/sacakly" ||
  !local(redis, "6379") ||
  redis.pathname !== "/15" ||
  process.env.NODE_ENV === "production"
) {
  throw new Error(
    "Browser E2E setup requires local sacakly_test, local admin database and Redis DB 15",
  );
}

async function main() {
  process.env.TEST_DATABASE_URL = databaseUrl;
  process.env.DATABASE_URL = databaseUrl;
  await setup();
  await seedBrowserE2e();
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
