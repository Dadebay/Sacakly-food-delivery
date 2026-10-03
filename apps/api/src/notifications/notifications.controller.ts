import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AdminPages, CurrentUser, Roles } from "../common/auth.decorators";
import type { AuthUser } from "../common/auth.types";
import { AdminPage, Role } from "../generated/prisma/client";
import {
  CreateNotificationCampaignDto,
  ListMyNotificationsQueryDto,
  ListNotificationCampaignsQueryDto,
  RegisterPushDeviceDto,
} from "./notifications.dto";
import {
  MarkAllNotificationsReadResponseDto,
  MarkNotificationReadResponseDto,
  NotificationCampaignListResponseDto,
  NotificationCampaignResponseDto,
  PushDeviceResponseDto,
  UnreadNotificationCountResponseDto,
  UserNotificationListResponseDto,
} from "./notifications-response.dto";
import { NotificationsService } from "./notifications.service";

@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Put("devices")
  @Roles(Role.CUSTOMER, Role.COURIER)
  @ApiOperation({
    summary: "Register or refresh the current mobile FCM registration token",
    description:
      "Customers and couriers register devices for their own authenticated account.",
  })
  @ApiOkResponse({ type: PushDeviceResponseDto })
  registerDevice(
    @CurrentUser() actor: AuthUser,
    @Body() dto: RegisterPushDeviceDto,
  ) {
    return this.notifications.registerDevice(actor, dto);
  }

  @Delete("devices/:installationId")
  @Roles(Role.CUSTOMER, Role.COURIER)
  @HttpCode(204)
  @ApiOperation({
    summary: "Deactivate one current-user push installation",
    description:
      "Customers and couriers can deactivate only their own devices.",
  })
  @ApiNoContentResponse()
  async unregisterDevice(
    @CurrentUser() actor: AuthUser,
    @Param("installationId") installationId: string,
  ) {
    await this.notifications.unregisterDevice(actor, installationId);
  }

  @Get("me")
  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: "List the current customer's notification inbox" })
  @ApiOkResponse({ type: UserNotificationListResponseDto })
  mine(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListMyNotificationsQueryDto,
  ) {
    return this.notifications.myNotifications(actor, query);
  }

  @Get("me/unread-count")
  @Roles(Role.CUSTOMER)
  @ApiOkResponse({ type: UnreadNotificationCountResponseDto })
  unread(@CurrentUser() actor: AuthUser) {
    return this.notifications.unreadCount(actor);
  }

  @Patch("me/:id/read")
  @Roles(Role.CUSTOMER)
  @ApiOkResponse({ type: MarkNotificationReadResponseDto })
  markRead(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.notifications.markRead(actor, id);
  }

  @Post("me/read-all")
  @Roles(Role.CUSTOMER)
  @HttpCode(200)
  @ApiOkResponse({ type: MarkAllNotificationsReadResponseDto })
  markAllRead(@CurrentUser() actor: AuthUser) {
    return this.notifications.markAllRead(actor);
  }

  @Get("admin/campaigns")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.NOTIFICATIONS)
  @ApiOperation({ summary: "List push campaigns and delivery totals" })
  @ApiOkResponse({ type: NotificationCampaignListResponseDto })
  campaigns(@Query() query: ListNotificationCampaignsQueryDto) {
    return this.notifications.campaigns(query);
  }

  @Post("admin/campaigns")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.NOTIFICATIONS)
  @ApiOperation({
    summary:
      "Create and queue a customer or public guest-inclusive topic campaign",
  })
  @ApiCreatedResponse({ type: NotificationCampaignResponseDto })
  createCampaign(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateNotificationCampaignDto,
  ) {
    return this.notifications.createCampaign(actor, dto);
  }

  @Post("admin/campaigns/:id/retry")
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.NOTIFICATIONS)
  @ApiOkResponse({ type: NotificationCampaignResponseDto })
  retryCampaign(
    @CurrentUser() actor: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.notifications.retryCampaign(actor, id);
  }
}
