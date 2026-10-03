import { Module } from "@nestjs/common";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { InventoryFlowService } from "./inventory-flow.service";

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, InventoryFlowService],
  exports: [InventoryService],
})
export class InventoryModule {}
