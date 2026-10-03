import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import type { AppEnv } from "./config/env";
import { validateEnv } from "./config/env";
import { JwtAuthGuard } from "./common/jwt-auth.guard";
import { OperationsAuditFilter } from "./common/operations-audit.filter";
import { InventoryModule } from "./inventory/inventory.module";
import { RolesGuard } from "./common/roles.guard";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { CatalogModule } from "./catalog/catalog.module";
import { OrdersModule } from "./orders/orders.module";
import { MarketingModule } from "./marketing/marketing.module";
import { MediaModule } from "./media/media.module";
import { UsersModule } from "./users/users.module";
import { HealthController } from "./health/health.controller";
import { RedisModule } from "./redis/redis.module";
import { TrackingModule } from "./tracking/tracking.module";
import { BranchesModule } from "./branches/branches.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { FavoritesModule } from "./favorites/favorites.module";
import { ContactModule } from "./contact/contact.module";
import { GeocodingModule } from "./geocoding/geocoding.module";
import { DeliveryModule } from "./delivery/delivery.module";
import { AccountingModule } from "./accounting/accounting.module";
import { AppVersionsModule } from "./app-versions/app-versions.module";
import { LoyaltyModule } from "./loyalty/loyalty.module";
import { MarketplaceModule } from "./marketplace/marketplace.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: process.env.NODE_ENV === "test",
      validate: validateEnv,
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) => ({
        secret: config.get("JWT_ACCESS_SECRET", { infer: true }),
        signOptions: {
          expiresIn: config.get("ACCESS_TOKEN_TTL", {
            infer: true,
          }),
          issuer: "alowalow-api",
          audience: "alowalow-clients",
        },
        verifyOptions: {
          issuer: "alowalow-api",
          audience: "alowalow-clients",
        },
      }),
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    CatalogModule,
    OrdersModule,
    MarketingModule,
    MediaModule,
    UsersModule,
    TrackingModule,
    BranchesModule,
    NotificationsModule,
    FavoritesModule,
    ContactModule,
    GeocodingModule,
    DeliveryModule,
    AccountingModule,
    AppVersionsModule,
    InventoryModule,
    LoyaltyModule,
    MarketplaceModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: OperationsAuditFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
