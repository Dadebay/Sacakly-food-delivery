import { Module } from "@nestjs/common";
import { MarketplaceController } from "./marketplace.controller";
import { MarketplaceService } from "./marketplace.service";
import { OrdersModule } from "../orders/orders.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { MarketplaceDispatchController } from "./marketplace-dispatch.controller";
import { MarketplaceDispatchService } from "./marketplace-dispatch.service";
import { MarketplacePublicController } from "./marketplace-public.controller";

@Module({ imports: [OrdersModule, NotificationsModule], controllers: [MarketplaceController, MarketplacePublicController, MarketplaceDispatchController], providers: [MarketplaceService, MarketplaceDispatchService], exports: [MarketplaceService] })
export class MarketplaceModule {}
