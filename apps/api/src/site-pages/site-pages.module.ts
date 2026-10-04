import { Module } from "@nestjs/common";
import { MarketplaceModule } from "../marketplace/marketplace.module";
import { SitePagesController } from "./site-pages.controller";
import { SitePagesService } from "./site-pages.service";

@Module({ imports: [MarketplaceModule], controllers: [SitePagesController], providers: [SitePagesService] })
export class SitePagesModule {}
