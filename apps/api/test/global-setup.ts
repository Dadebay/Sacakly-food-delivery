import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { createClient } from "redis";

const TEST_DATABASE = "sacakly_test";
const ADMIN_DATABASE_URL =
  process.env.TEST_DATABASE_ADMIN_URL ??
  "postgresql://sacakly:sacakly@localhost:5432/sacakly";
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://sacakly:sacakly@localhost:5432/${TEST_DATABASE}`;
const TEST_REDIS_URL =
  process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15";

async function flushTestRedis() {
  const client = createClient({ url: TEST_REDIS_URL });
  await client.connect();
  try {
    await client.flushDb();
  } finally {
    client.destroy();
  }
}

async function recreateTestDatabase() {
  const client = new Client({ connectionString: ADMIN_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [TEST_DATABASE],
    );
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}"`);
    await client.query(`CREATE DATABASE "${TEST_DATABASE}"`);
  } finally {
    await client.end();
  }
}

async function dropTestDatabase() {
  const client = new Client({ connectionString: ADMIN_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [TEST_DATABASE],
    );
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}"`);
  } finally {
    await client.end();
  }
}

export async function setup() {
  await flushTestRedis();
  await recreateTestDatabase();
  execFileSync("npm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
    },
    stdio: "pipe",
  });

  return async () => {
    await flushTestRedis();
    await dropTestDatabase();
  };
}
