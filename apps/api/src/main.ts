import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SwaggerModule } from "@nestjs/swagger";
import type { NextFunction, Request, Response } from "express";
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
    customSiteTitle: "Saçakly API",
  });
  const config = app.get(ConfigService<AppEnv, true>);
  if (config.get("NODE_ENV", { infer: true }) === "development") {
    const requests = new Logger("HTTP");
    const colors = !process.env.NO_COLOR;
    app.use((request: Request, response: Response, next: NextFunction) => {
      const started = performance.now();
      response.on("finish", () => {
        const status = response.statusCode;
        const color = status >= 500 ? 31 : status >= 400 ? 33 : 32;
        const route: unknown = request.route;
        const path =
          route &&
          typeof route === "object" &&
          "path" in route &&
          typeof route.path === "string"
            ? route.path
            : "(unmatched)";
        const label = `${request.method} ${path} → ${status}`;
        const colored = colors ? `\u001b[${color}m${label}\u001b[0m` : label;
        requests.log(`${colored} ${Math.round(performance.now() - started)}ms`);
      });
      next();
    });
  }
  const port = config.get("PORT", { infer: true });
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
