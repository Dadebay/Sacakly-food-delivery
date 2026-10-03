import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DocumentBuilder,
  OpenAPIObject,
  SwaggerModule,
} from "@nestjs/swagger";
import helmet from "helmet";
import type { AppEnv } from "./config/env";

export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService<AppEnv, true>);
  const origins = config
    .get("CORS_ORIGINS", { infer: true })
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
    maxAge: 86_400,
  });
  app.setGlobalPrefix("api");
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
    }),
  );
  app.enableShutdownHooks();
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const options = new DocumentBuilder()
    .setTitle("AlowLink Platform API")
    .setDescription(
      "SMS phone authentication backed by Redis, food catalog, marketing, role-gated order workflow, courier tracking and routes, cash handover and reconciliation.",
    )
    .setVersion("1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
      "bearer",
    )
    .addTag("auth")
    .addTag("sms-gateway")
    .addTag("addresses")
    .addTag("catalog")
    .addTag("orders")
    .addTag("marketing")
    .addTag("media")
    .addTag("staff")
    .addTag("tracking")
    .addTag("notifications")
    .addTag("marketplace")
    .build();

  return SwaggerModule.createDocument(app, options);
}
