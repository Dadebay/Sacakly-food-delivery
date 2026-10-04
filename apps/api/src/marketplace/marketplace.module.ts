import { Module } from "@nestjs/common";
import { MarketplaceController } from "./marketplace.controller";
import { MarketplaceService } from "./marketplace.service";
import { OrdersModule } from "../orders/orders.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { MarketplaceDispatchController } from "./marketplace-dispatch.controller";
import { MarketplaceDispatchService } from "./marketplace-dispatch.service";
import { MarketplacePublicController } from "./marketplace-public.controller";
import { MarketplaceCatalogController } from "./marketplace-catalog.controller";
import { MarketplaceCatalogService } from "./marketplace-catalog.service";

@Module({ imports: [OrdersModule, NotificationsModule], controllers: [MarketplaceController, MarketplacePublicController, MarketplaceDispatchController, MarketplaceCatalogController], providers: [MarketplaceService, MarketplaceDispatchService, MarketplaceCatalogService], exports: [MarketplaceService] })
export class MarketplaceModule {}
