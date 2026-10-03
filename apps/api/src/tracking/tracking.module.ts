import { Module } from "@nestjs/common";
import { TrackingController } from "./tracking.controller";
import { TrackingService } from "./tracking.service";
import { TrackingLiveService } from "./tracking-live.service";

@Module({
  controllers: [TrackingController],
  providers: [TrackingService, TrackingLiveService],
  exports: [TrackingService],
})
export class TrackingModule {}
