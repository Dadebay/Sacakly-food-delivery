import { Module } from "@nestjs/common";
import { BranchesModule } from "../branches/branches.module";
import { GeocodingModule } from "../geocoding/geocoding.module";
import { DeliveryController } from "./delivery.controller";
import { DeliveryService } from "./delivery.service";

@Module({
  imports: [BranchesModule, GeocodingModule],
  controllers: [DeliveryController],
  providers: [DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
