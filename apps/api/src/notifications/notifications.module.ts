import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { PushGateway } from "./push.gateway";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, PushGateway],
  exports: [NotificationsService],
})
export class NotificationsModule {}
