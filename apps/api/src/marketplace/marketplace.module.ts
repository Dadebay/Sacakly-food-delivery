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
import { MarketplaceReceiptsService } from "./marketplace-receipts.service";
import { MarketplaceReceiptsController } from "./marketplace-receipts.controller";
import { MarketplaceReceiptAgentController } from "./marketplace-receipt-agent.controller";
import { MarketplaceReceiptAgentGuard } from "./marketplace-receipt-agent.guard";

@Module({ imports: [OrdersModule, NotificationsModule], controllers: [MarketplaceController, MarketplacePublicController, MarketplaceDispatchController, MarketplaceCatalogController, MarketplaceReceiptsController, MarketplaceReceiptAgentController], providers: [MarketplaceService, MarketplaceDispatchService, MarketplaceCatalogService, MarketplaceReceiptsService, MarketplaceReceiptAgentGuard], exports: [MarketplaceService] })
export class MarketplaceModule {}
