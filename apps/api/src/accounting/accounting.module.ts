import { Module } from "@nestjs/common";
import { AccountingController } from "./accounting.controller";
import { AccountingService } from "./accounting.service";
import { AccountingInspectionService } from "./accounting-inspection.service";
import { AccountingInspectionController } from "./accounting-inspection.controller";

@Module({
  controllers: [AccountingController, AccountingInspectionController],
  providers: [AccountingService, AccountingInspectionService],
})
export class AccountingModule {}
