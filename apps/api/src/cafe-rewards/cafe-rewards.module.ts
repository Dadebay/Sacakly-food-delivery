import { Module } from "@nestjs/common";
import { LoyaltyModule } from "../loyalty/loyalty.module";
import { CafeRewardsController } from "./cafe-rewards.controller";
import { CafeRewardsService } from "./cafe-rewards.service";

@Module({ imports: [LoyaltyModule], controllers: [CafeRewardsController], providers: [CafeRewardsService], exports: [CafeRewardsService] })
export class CafeRewardsModule {}
