import "reflect-metadata";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

process.env.GENERATE_OPENAPI = "true";
const require = createRequire(import.meta.url);
const { NestFactory } = require("@nestjs/core");
const { AppModule } = require("../dist/src/app.module.js");
const {
  configureApp,
  createOpenApiDocument,
} = require("../dist/src/bootstrap.js");

const app = await NestFactory.create(AppModule, { logger: ["error"] });
configureApp(app);
const document = createOpenApiDocument(app);
await writeFile(
  resolve(process.cwd(), "openapi.json"),
  `${JSON.stringify(document, null, 2)}\n`,
);
await app.close();
