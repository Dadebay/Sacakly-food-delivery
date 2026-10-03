import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { configureApp, createOpenApiDocument } from "./bootstrap";
import type { AppEnv } from "./config/env";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  configureApp(app);
  const document = createOpenApiDocument(app);
  SwaggerModule.setup("docs", app, document, {
    jsonDocumentUrl: "docs-json",
    customSiteTitle: "AlowAlow API",
  });
  const config = app.get(ConfigService<AppEnv, true>);
  const port = config.get("PORT", { infer: true });
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
